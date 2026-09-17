import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { loadConfig } from '../src/config.js';
import { TelegramApi } from '../src/telegram-api.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDirectory, '../.env') });

const config = loadConfig();
if (!config.telegramBotToken) {
    console.error('Missing TELEGRAM_BOT_TOKEN.');
    process.exitCode = 1;
} else {
    const telegram = new TelegramApi(config.telegramBotToken);
    const info = await telegram.call('getWebhookInfo');
    console.log(JSON.stringify({
        url: info.url,
        pendingUpdateCount: info.pending_update_count,
        lastErrorDate: info.last_error_date || null,
        lastErrorMessage: info.last_error_message || null
    }, null, 2));
}
