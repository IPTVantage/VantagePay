import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotHandler } from '../src/bot.js';
import { TelegramOrderService } from '../src/order-service.js';
import { FakeTelegram, MemoryRepository, sampleOrder, testConfig } from './helpers.js';

const fixedNow = () => new Date('2026-09-14T10:00:00.000Z');

function startMessage(productId, userId = 123) {
    return {
        message: {
            message_id: 1,
            chat: { id: userId },
            from: {
                id: userId,
                username: 'john',
                first_name: 'John',
                last_name: 'Viewer',
                language_code: 'en'
            },
            text: productId ? `/start ${productId}` : '/start'
        }
    };
}

function buildBot(repository, telegram) {
    const orderService = new TelegramOrderService({ repository, now: fixedNow });
    return createBotHandler({
        repository,
        telegram,
        config: testConfig(),
        orderService,
        now: fixedNow
    });
}

function callbackUpdate(action, fromId, messageId = 50) {
    return {
        callback_query: {
            id: `callback-${action}-${fromId}`,
            from: { id: fromId, first_name: 'User' },
            message: { message_id: messageId, chat: { id: fromId } },
            data: `${action}:IPT-A1B2C3D4`
        }
    };
}

function adminMessage(text, messageId = 60) {
    return {
        message: {
            message_id: messageId,
            chat: { id: 999 },
            from: { id: 999, first_name: 'Admin' },
            text
        }
    };
}

test('/start creates and displays the exact selected order', async () => {
    const repository = new MemoryRepository();
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(startMessage('premium_12m'));

    assert.equal(repository.orders[0].telegram_user_id, '123');
    assert.equal(repository.orders[0].telegram_username, 'john');
    assert.match(telegram.sent[0].text, /Premium/);
    assert.match(telegram.sent[0].text, /12 Months/);
    assert.match(telegram.sent[0].text, /€99\.99/);
    assert.equal(telegram.sent[0].options.reply_markup.inline_keyboard[0][0].text, '✅ I HAVE PAID');
});

test('/start rejects missing and unknown product IDs', async () => {
    const repository = new MemoryRepository();
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(startMessage());
    await bot.handleUpdate(startMessage('premium_99'));

    assert.equal(repository.orders.length, 0);
    assert.equal(telegram.sent.length, 2);
    assert.match(telegram.sent[0].text, /Subscribe button/);
    assert.match(telegram.sent[1].text, /subscription option is invalid/);
});

test('I HAVE PAID is idempotent and notifies the admin once', async () => {
    const repository = new MemoryRepository([sampleOrder({
        telegram_user_id: '123',
        telegram_first_name: 'John',
        customer_message_id: 50
    })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);
    const update = callbackUpdate('payment_submitted', 123);

    await bot.handleUpdate(update);
    await bot.handleUpdate(update);

    assert.equal(repository.orders[0].status, 'payment_submitted');
    assert.equal(telegram.sent.filter((message) => message.chatId === '999').length, 1);
    assert.equal(telegram.answered.length, 2);
    assert.match(telegram.sent[0].text, /PAYMENT SUBMITTED/);
});

test('unauthorized users cannot run admin callbacks', async () => {
    const repository = new MemoryRepository([sampleOrder({
        status: 'payment_submitted',
        telegram_user_id: '123'
    })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(callbackUpdate('admin_paid', 555));

    assert.equal(repository.orders[0].status, 'payment_submitted');
    assert.equal(telegram.edited.length, 0);
    assert.match(telegram.answered[0].options.text, /not authorized/);
});

test('admin must complete the account form before marking an order paid', async () => {
    const repository = new MemoryRepository([sampleOrder({
        status: 'payment_submitted',
        telegram_user_id: '123',
        telegram_language_code: 'en-US',
        customer_message_id: 45,
        admin_message_id: 50
    })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(callbackUpdate('admin_paid', 999));
    assert.equal(repository.orders[0].status, 'payment_submitted');
    assert.match(telegram.sent.at(-1).text, /Step 1\/4 — Username/);

    await bot.handleUpdate(adminMessage('client-user', 61));
    await bot.handleUpdate(adminMessage('S3cure<&Password', 62));
    await bot.handleUpdate(adminMessage('https://stream.example.test:8443', 63));
    await bot.handleUpdate(adminMessage('IPTV Smarters Pro', 64));

    const preview = telegram.sent.at(-1);
    assert.match(preview.text, /Review account/);
    assert.match(preview.text, /client-user/);
    assert.match(preview.text, /S3cure&lt;&amp;Password/);
    assert.equal(preview.options.reply_markup.inline_keyboard[0][0].text, '✅ CONFIRM, MARK PAID & SEND');

    await bot.handleUpdate(callbackUpdate('admin_fulfill', 999, preview.message_id));

    assert.equal(repository.orders[0].status, 'paid');
    assert.equal(repository.orders[0].approved_by, '999');
    assert.equal(repository.orders[0].paid_at, fixedNow().toISOString());
    assert.equal(repository.orders[0].account_username, 'client-user');
    assert.equal(repository.orders[0].account_password, 'S3cure<&Password');
    assert.equal(repository.orders[0].account_url, 'https://stream.example.test:8443');
    assert.equal(repository.orders[0].application_name, 'IPTV Smarters Pro');
    assert.equal(repository.orders[0].expires_at, '2027-09-14T10:00:00.000Z');
    assert.equal(repository.orders[0].country, 'United States');
    assert.match(repository.orders[0].client_id, /^[A-Z2-9]{5}$/);
    assert.equal(telegram.answered.length, 2);
    assert.ok(telegram.edited.some((message) => /payment has been confirmed/.test(message.text)));
    const accountMessage = telegram.sent.find((message) =>
        message.chatId === '123' && /🟢ACTIVE🟢/.test(message.text));
    assert.ok(accountMessage);
    assert.match(accountMessage.text, /<b><i>IPTVantage<\/i><\/b>/);
    assert.match(accountMessage.text, /Premium — 12 Months/);
    assert.match(accountMessage.text, /🕔EXP : 14\/09\/2027/);
    assert.match(accountMessage.text, /🌍Country : United States/);
    assert.match(accountMessage.text, /https:\/\/iptvantage\.net/);
    assert.deepEqual(
        new Set(telegram.deleted.map((entry) => entry.messageId)),
        new Set([100, 61, 101, 62, 102, 63, 103, 64])
    );
    assert.ok(!telegram.deleted.some((entry) => entry.messageId === preview.message_id));
});

test('admin account form rejects an invalid service URL', async () => {
    const repository = new MemoryRepository([sampleOrder({ status: 'payment_submitted' })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(callbackUpdate('admin_paid', 999));
    await bot.handleUpdate(adminMessage('client-user'));
    await bot.handleUpdate(adminMessage('password'));
    await bot.handleUpdate(adminMessage('not-a-url'));

    assert.equal(repository.orders[0].status, 'payment_submitted');
    assert.match(telegram.sent.at(-1).text, /complete http:\/\/ or https:\/\/ address/);
});

test('REJECT keeps the order and notifies the customer', async () => {
    const repository = new MemoryRepository([sampleOrder({
        status: 'payment_submitted',
        telegram_user_id: '123',
        customer_message_id: 45,
        admin_message_id: 50
    })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate(callbackUpdate('admin_reject', 999));

    assert.equal(repository.orders.length, 1);
    assert.equal(repository.orders[0].status, 'rejected');
    assert.equal(repository.orders[0].rejected_at, fixedNow().toISOString());
    assert.ok(telegram.edited.some((message) => /could not be confirmed/.test(message.text)));
});

test('/myorders and /help return concise customer-facing messages', async () => {
    const repository = new MemoryRepository([sampleOrder({ telegram_user_id: '123', status: 'paid' })]);
    const telegram = new FakeTelegram();
    const bot = buildBot(repository, telegram);

    await bot.handleUpdate({ message: { chat: { id: 123 }, from: { id: 123 }, text: '/myorders' } });
    await bot.handleUpdate({ message: { chat: { id: 123 }, from: { id: 123 }, text: '/help' } });

    assert.match(telegram.sent[0].text, /Your IPTVantage Orders/);
    assert.match(telegram.sent[0].text, /🟢 Paid/);
    assert.match(telegram.sent[1].text, /IPTVantage Help/);
});
