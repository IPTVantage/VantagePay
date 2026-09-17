import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramPoller } from '../src/polling.js';

test('local polling removes the webhook and processes Telegram updates', async () => {
    const calls = [];
    let poller;
    const telegram = {
        async deleteWebhook() {
            calls.push('deleteWebhook');
        },
        async getUpdates(payload) {
            calls.push({ method: 'getUpdates', payload });
            return [{ update_id: 7, message: { text: '/start standard_1m' } }];
        }
    };
    const handled = [];
    const botHandler = {
        async handleUpdate(update) {
            handled.push(update);
            poller.stop();
        }
    };
    const logger = { log() {}, error() {} };

    poller = createTelegramPoller({ telegram, botHandler, logger });
    await poller.run();

    assert.equal(calls[0], 'deleteWebhook');
    assert.equal(calls[1].payload.offset, 0);
    assert.equal(calls[1].payload.timeout, 25);
    assert.equal(handled[0].update_id, 7);
});
