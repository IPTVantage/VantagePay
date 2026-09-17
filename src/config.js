function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env = process.env) {
    const nodeEnv = clean(env.NODE_ENV) || 'development';
    const appBaseUrl = clean(env.APP_BASE_URL).replace(/\/+$/, '');
    const requestedTelegramMode = clean(env.TELEGRAM_MODE).toLowerCase();
    const telegramMode = ['polling', 'webhook'].includes(requestedTelegramMode)
        ? requestedTelegramMode
        : (nodeEnv === 'production' ? 'webhook' : 'polling');
    return Object.freeze({
        port: parsePositiveNumber(env.PORT, 3000),
        nodeEnv,
        isProduction: nodeEnv === 'production',
        appBaseUrl,
        appTimezone: clean(env.APP_TIMEZONE) || 'Europe/Nicosia',
        telegramBotToken: clean(env.TELEGRAM_BOT_TOKEN),
        telegramAdminId: clean(env.TELEGRAM_ADMIN_ID),
        telegramWebhookSecret: clean(env.TELEGRAM_WEBHOOK_SECRET),
        telegramMode,
        mongoDbUri: clean(env.MONGODB_URI),
        mongoDbName: clean(env.MONGODB_DB_NAME) || 'iptvantage',
        payment: Object.freeze({
            methodName: clean(env.PAYMENT_METHOD_NAME),
            recipient: clean(env.PAYMENT_RECIPIENT),
            iban: clean(env.PAYMENT_IBAN),
            instructions: clean(env.PAYMENT_INSTRUCTIONS)
        })
    });
}

export function missingBotConfig(config) {
    const missing = [];
    if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
    if (!config.telegramAdminId) missing.push('TELEGRAM_ADMIN_ID');
    if (config.isProduction && !config.mongoDbUri) missing.push('MONGODB_URI');
    if (config.telegramMode === 'webhook' && !config.appBaseUrl) missing.push('APP_BASE_URL');
    if (config.telegramMode === 'webhook' && !config.telegramWebhookSecret) {
        missing.push('TELEGRAM_WEBHOOK_SECRET');
    }
    return [...new Set(missing)];
}
