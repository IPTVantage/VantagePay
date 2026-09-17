export class TelegramApiError extends Error {
    constructor(method, description, status) {
        super(`Telegram ${method} failed: ${description || 'unknown error'}`);
        this.status = status;
    }
}

export class TelegramApi {
    constructor(botToken, fetchImplementation = globalThis.fetch) {
        this.botToken = botToken;
        this.fetch = fetchImplementation;
    }

    async call(method, payload = {}, options = {}) {
        if (!this.botToken) throw new TelegramApiError(method, 'bot token is not configured', 503);

        const response = await this.fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: options.signal
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.ok) {
            throw new TelegramApiError(method, result.description, response.status);
        }

        return result.result;
    }

    sendMessage(chatId, text, options = {}) {
        return this.call('sendMessage', { chat_id: chatId, text, ...options });
    }

    editMessageText(chatId, messageId, text, options = {}) {
        return this.call('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text,
            ...options
        });
    }

    answerCallbackQuery(callbackQueryId, options = {}) {
        return this.call('answerCallbackQuery', {
            callback_query_id: callbackQueryId,
            ...options
        });
    }

    deleteMessage(chatId, messageId) {
        return this.call('deleteMessage', {
            chat_id: chatId,
            message_id: messageId
        });
    }

    getUpdates(payload, signal) {
        return this.call('getUpdates', payload, { signal });
    }

    deleteWebhook() {
        return this.call('deleteWebhook', { drop_pending_updates: false });
    }
}
