import test from 'node:test';
import assert from 'node:assert/strict';
import { configureTelegramDelivery } from '../src/server.js';

test('production startup registers the Render webhook with Telegram', async () => {
    const calls = [];
    const telegram = {
        async call(method, payload) {
            calls.push({ method, payload });
            return true;
        }
    };

    await configureTelegramDelivery({
        config: {
            telegramMode: 'webhook',
            appBaseUrl: 'https://iptvantage-payment-bot.onrender.com',
            telegramWebhookSecret: 'safe-webhook-secret'
        },
        botHandler: {},
        telegram,
        logger: { log() {}, error() {} }
    });

    assert.deepEqual(calls, [{
        method: 'setWebhook',
        payload: {
            url: 'https://iptvantage-payment-bot.onrender.com/api/telegram/webhook',
            secret_token: 'safe-webhook-secret',
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: false
        }
    }]);
});
