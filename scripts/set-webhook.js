import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { loadConfig } from '../src/config.js';
import { TelegramApi } from '../src/telegram-api.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDirectory, '../.env') });

const config = loadConfig();
const required = [
    ['TELEGRAM_BOT_TOKEN', config.telegramBotToken],
    ['APP_BASE_URL', config.appBaseUrl],
    ['TELEGRAM_WEBHOOK_SECRET', config.telegramWebhookSecret]
].filter(([, value]) => !value).map(([name]) => name);

if (required.length > 0) {
    console.error(`Missing required variables: ${required.join(', ')}`);
    process.exitCode = 1;
} else if (!config.appBaseUrl.startsWith('https://')) {
    console.error('APP_BASE_URL must be a public HTTPS URL.');
    process.exitCode = 1;
} else {
    const telegram = new TelegramApi(config.telegramBotToken);
    const webhookUrl = `${config.appBaseUrl}/api/telegram/webhook`;
    await telegram.call('setWebhook', {
        url: webhookUrl,
        secret_token: config.telegramWebhookSecret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
    });
    console.log(`Telegram webhook registered: ${webhookUrl}`);
}
