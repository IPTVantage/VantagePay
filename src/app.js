import { timingSafeEqual } from 'node:crypto';
import express from 'express';

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createApp({ config, botHandler, logger = console }) {
    const app = express();

    app.disable('x-powered-by');
    app.use((request, response, next) => {
        response.set({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
        });
        next();
    });
    app.use(express.json({ limit: '16kb' }));

    app.get('/health', (_request, response) => {
        response.status(200).json({ status: 'ok' });
    });

    app.post('/api/telegram/webhook', async (request, response) => {
        if (config.telegramWebhookSecret) {
            const suppliedSecret = request.get('X-Telegram-Bot-Api-Secret-Token');
            if (!safeEqual(suppliedSecret, config.telegramWebhookSecret)) {
                return response.status(401).json({ error: 'Unauthorized webhook request.' });
            }
        } else if (config.isProduction) {
            return response.status(503).json({ error: 'Webhook security is not configured.' });
        }

        if (!botHandler) {
            return response.status(503).json({ error: 'Telegram integration is not configured.' });
        }

        try {
            await botHandler.handleUpdate(request.body);
            return response.status(200).json({ ok: true });
        } catch (error) {
            logger.error(`Telegram update processing failed: ${error?.message || 'Unknown error.'}`);
            return response.status(500).json({ error: 'Unable to process Telegram update.' });
        }
    });

    app.use('/api', (_request, response) => {
        response.status(404).json({ error: 'Not found.' });
    });

    app.use((error, _request, response, _next) => {
        if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
            return response.status(400).json({ error: 'Invalid JSON body.' });
        }
        logger.error('Unhandled request error.');
        return response.status(500).json({ error: 'Internal server error.' });
    });

    return app;
}
