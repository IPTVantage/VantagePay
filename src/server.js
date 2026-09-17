import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createBotHandler } from './bot.js';
import { loadConfig, missingBotConfig } from './config.js';
import { TelegramOrderService } from './order-service.js';
import { createTelegramPoller } from './polling.js';
import { createOrderRepository } from './repository.js';
import { TelegramApi } from './telegram-api.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const botDirectory = path.resolve(currentDirectory, '..');
dotenv.config({ path: path.join(botDirectory, '.env') });

export function createRuntime(env = process.env) {
    const config = loadConfig(env);
    const repository = createOrderRepository(config);
    const orderService = repository ? new TelegramOrderService({ repository }) : null;
    const telegram = config.telegramBotToken ? new TelegramApi(config.telegramBotToken) : null;
    const botHandler = missingBotConfig(config).length === 0
        ? createBotHandler({ repository, telegram, config, orderService })
        : null;
    const app = createApp({
        config,
        botHandler
    });

    return { app, botHandler, config, repository, telegram };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { app, botHandler, config, repository, telegram } = createRuntime();
    const missing = missingBotConfig(config);
    if (missing.length > 0) {
        console.warn(`Telegram payment flow is disabled until these variables are configured: ${missing.join(', ')}`);
    }

    const server = app.listen(config.port, '0.0.0.0', () => {
        console.log(`IPTVantage listening on port ${config.port}.`);

        if (botHandler && config.telegramMode === 'polling') {
            poller = createTelegramPoller({ telegram, botHandler });
            poller.run().catch(() => console.error('Telegram polling stopped unexpectedly.'));
        }
    });

    let poller = null;
    const shutdown = () => {
        poller?.stop();
        server.close(async () => {
            await repository?.close?.();
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
