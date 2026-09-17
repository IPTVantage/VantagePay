import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, missingBotConfig } from '../src/config.js';

test('local development defaults to polling and does not require MongoDB', () => {
    const config = loadConfig({
        NODE_ENV: 'development',
        TELEGRAM_BOT_TOKEN: 'test-token',
        TELEGRAM_ADMIN_ID: '123'
    });

    assert.equal(config.telegramMode, 'polling');
    assert.equal(config.mongoDbName, 'iptvantage');
    assert.deepEqual(missingBotConfig(config), []);
});

test('production requires MongoDB and a webhook secret', () => {
    const config = loadConfig({
        NODE_ENV: 'production',
        TELEGRAM_BOT_TOKEN: 'test-token',
        TELEGRAM_ADMIN_ID: '123'
    });

    assert.equal(config.telegramMode, 'webhook');
    assert.deepEqual(missingBotConfig(config), ['MONGODB_URI', 'TELEGRAM_WEBHOOK_SECRET']);
});
