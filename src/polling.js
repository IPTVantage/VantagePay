const RETRY_DELAY_MS = 2_000;

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createTelegramPoller({ telegram, botHandler, logger = console }) {
    let stopped = false;
    let offset = 0;
    let activeRequest = null;

    async function run() {
        await telegram.deleteWebhook();
        logger.log('Telegram long polling is active for local development.');

        while (!stopped) {
            activeRequest = new AbortController();
            try {
                const updates = await telegram.getUpdates({
                    offset,
                    timeout: 25,
                    allowed_updates: ['message', 'callback_query']
                }, activeRequest.signal);

                for (const update of updates) {
                    if (stopped) break;
                    offset = Math.max(offset, Number(update.update_id) + 1);
                    try {
                        await botHandler.handleUpdate(update);
                    } catch {
                        logger.error('Telegram update processing failed.');
                    }
                }
            } catch (error) {
                if (stopped || error?.name === 'AbortError') break;
                logger.error('Telegram polling request failed; retrying.');
                await wait(RETRY_DELAY_MS);
            } finally {
                activeRequest = null;
            }
        }
    }

    function stop() {
        stopped = true;
        activeRequest?.abort();
    }

    return Object.freeze({ run, stop });
}
