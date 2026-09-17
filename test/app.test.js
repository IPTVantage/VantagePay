import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function withServer(app, callback) {
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const { port } = server.address();
    try {
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function config(overrides = {}) {
    return {
        isProduction: false,
        telegramWebhookSecret: 'test-webhook-secret',
        ...overrides
    };
}

const quietLogger = { error() {} };

test('/health returns only a safe status payload', async () => {
    const app = createApp({ config: config(), logger: quietLogger });
    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
    });
});

test('the payment bot service does not expose an order-creation API', async () => {
    const app = createApp({ config: config(), logger: quietLogger });

    await withServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: 'premium_12m' })
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: 'Not found.' });
    });
});

test('Telegram webhook enforces the configured secret header', async () => {
    let handled = 0;
    const botHandler = { async handleUpdate() { handled += 1; } };
    const app = createApp({ config: config(), botHandler, logger: quietLogger });

    await withServer(app, async (baseUrl) => {
        const unauthorized = await fetch(`${baseUrl}/api/telegram/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ update_id: 1 })
        });
        assert.equal(unauthorized.status, 401);
        assert.equal(handled, 0);

        const authorized = await fetch(`${baseUrl}/api/telegram/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret'
            },
            body: JSON.stringify({ update_id: 2 })
        });
        assert.equal(authorized.status, 200);
        assert.equal(handled, 1);
    });
});
