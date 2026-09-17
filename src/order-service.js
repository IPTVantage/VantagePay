import { randomBytes } from 'node:crypto';
import { getProductById, ORDER_STATUSES } from '../../subscription-plans.mjs';

export class InvalidProductError extends Error {}

export function generatePublicOrderId() {
    return `IPT-${randomBytes(8).toString('hex').toUpperCase()}`;
}

export class TelegramOrderService {
    constructor({ repository, now = () => new Date() }) {
        this.repository = repository;
        this.now = now;
    }

    async createOrder(productId, telegramUser, startMessageId) {
        const product = getProductById(productId);
        if (!product) throw new InvalidProductError('Unknown subscription product.');
        if (!this.repository) throw new Error('Order storage is not configured.');

        const now = this.now();
        const telegramUserId = String(telegramUser.id);
        const existing = await this.repository.findByTelegramStartMessage?.(telegramUserId, startMessageId);
        if (existing) return existing;

        const orderData = {
            public_order_id: generatePublicOrderId(),
            product_id: product.productId,
            plan: product.planName,
            duration_months: product.durationMonths,
            price: product.price,
            currency: product.currency,
            status: ORDER_STATUSES.PENDING,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUser.username || null,
            telegram_first_name: telegramUser.first_name || null,
            telegram_last_name: telegramUser.last_name || null,
            telegram_language_code: telegramUser.language_code || null,
            telegram_start_message_id: startMessageId || null,
            created_at: now.toISOString()
        };

        try {
            return await this.repository.createOrder(orderData);
        } catch (error) {
            const duplicateError = error?.cause?.code === 11000 || error?.cause?.code === 11001;
            const duplicate = duplicateError
                ? await this.repository.findByTelegramStartMessage?.(telegramUserId, startMessageId)
                : null;
            if (duplicate) return duplicate;
            throw error;
        }
    }
}
