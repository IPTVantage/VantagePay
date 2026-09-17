import test from 'node:test';
import assert from 'node:assert/strict';
import { InvalidProductError, TelegramOrderService } from '../src/order-service.js';
import { MemoryRepository } from './helpers.js';

const telegramUser = {
    id: 123,
    username: 'john',
    first_name: 'John',
    last_name: 'Viewer',
    language_code: 'en'
};

test('the bot creates an order using the trusted catalog price', async () => {
    const repository = new MemoryRepository();
    const service = new TelegramOrderService({
        repository,
        now: () => new Date('2026-09-14T10:00:00.000Z')
    });

    const order = await service.createOrder('premium_12m', telegramUser, 42);

    assert.equal(order.price, 99.99);
    assert.equal(order.plan, 'Premium');
    assert.equal(order.duration_months, 12);
    assert.equal(order.status, 'pending');
    assert.equal(order.telegram_user_id, '123');
    assert.equal(order.telegram_start_message_id, 42);
    assert.match(order.public_order_id, /^IPT-[A-F0-9]{16}$/);
});

test('invalid product IDs never create orders', async () => {
    const repository = new MemoryRepository();
    const service = new TelegramOrderService({ repository });
    await assert.rejects(() => service.createOrder('premium_99', telegramUser, 42), InvalidProductError);
    assert.equal(repository.orders.length, 0);
});

test('a retried Telegram start message does not create a duplicate order', async () => {
    const repository = new MemoryRepository();
    const service = new TelegramOrderService({ repository });
    const first = await service.createOrder('standard_1m', telegramUser, 42);
    const second = await service.createOrder('standard_1m', telegramUser, 42);
    assert.equal(first.id, second.id);
    assert.equal(repository.orders.length, 1);
});

test('different Telegram start messages create separate orders', async () => {
    const repository = new MemoryRepository();
    const service = new TelegramOrderService({ repository });
    const first = await service.createOrder('standard_1m', telegramUser, 42);
    const second = await service.createOrder('standard_1m', telegramUser, 43);
    assert.notEqual(first.public_order_id, second.public_order_id);
    assert.equal(repository.orders.length, 2);
});

test('a MongoDB duplicate-key retry returns the existing Telegram order', async () => {
    const existing = {
        id: 'existing-order',
        public_order_id: 'IPT-EXISTING',
        telegram_user_id: '123',
        telegram_start_message_id: 42
    };
    let lookupCount = 0;
    const repository = {
        async findByTelegramStartMessage() {
            lookupCount += 1;
            return lookupCount === 1 ? null : existing;
        },
        async createOrder() {
            const error = new Error('Database operation failed: create order');
            error.cause = { code: 11000 };
            throw error;
        }
    };
    const service = new TelegramOrderService({ repository });

    const order = await service.createOrder('standard_1m', telegramUser, 42);
    assert.equal(order, existing);
});
