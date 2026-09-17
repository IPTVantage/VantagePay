export class MemoryRepository {
    constructor(orders = []) {
        this.orders = orders.map((order, index) => ({ id: order.id || `order-${index + 1}`, ...order }));
    }

    async createOrder(order) {
        const created = { id: `order-${this.orders.length + 1}`, ...order };
        this.orders.push(created);
        return created;
    }

    async findByTelegramStartMessage(telegramUserId, startMessageId) {
        return this.orders.find((order) =>
            String(order.telegram_user_id) === String(telegramUserId)
            && String(order.telegram_start_message_id) === String(startMessageId)) || null;
    }

    async findByPublicOrderId(publicOrderId) {
        return this.orders.find((order) => order.public_order_id === publicOrderId) || null;
    }

    async findById(id) {
        return this.orders.find((order) => order.id === id) || null;
    }

    async findByClientId(clientId) {
        return this.orders.find((order) => order.client_id === clientId) || null;
    }

    async claimOrder(id, user) {
        const order = await this.findById(id);
        if (!order || (order.telegram_user_id && String(order.telegram_user_id) !== String(user.id))) return null;
        Object.assign(order, {
            telegram_user_id: String(user.id),
            telegram_username: user.username || null,
            telegram_first_name: user.first_name || null,
            telegram_last_name: user.last_name || null,
            telegram_language_code: user.language_code || null
        });
        return order;
    }

    async updateMessageIds(id, values) {
        const order = await this.findById(id);
        Object.assign(order, values);
        return order;
    }

    async listByTelegramUserId(id, limit = 10) {
        return this.orders.filter((order) => String(order.telegram_user_id) === String(id)).slice(0, limit);
    }

    async transitionStatus(id, fromStatus, toStatus, updates = {}) {
        const order = await this.findById(id);
        if (!order || order.status !== fromStatus) return { changed: false, order };
        Object.assign(order, { status: toStatus, ...updates });
        return { changed: true, order };
    }
}

export class FakeTelegram {
    constructor() {
        this.sent = [];
        this.edited = [];
        this.answered = [];
        this.deleted = [];
        this.nextMessageId = 100;
    }

    async sendMessage(chatId, text, options) {
        const message = { chatId: String(chatId), text, options, message_id: this.nextMessageId++ };
        this.sent.push(message);
        return message;
    }

    async editMessageText(chatId, messageId, text, options) {
        this.edited.push({ chatId: String(chatId), messageId, text, options });
        return true;
    }

    async answerCallbackQuery(id, options) {
        this.answered.push({ id, options });
        return true;
    }

    async deleteMessage(chatId, messageId) {
        this.deleted.push({ chatId: String(chatId), messageId });
        return true;
    }
}

export function sampleOrder(overrides = {}) {
    return {
        id: 'order-1',
        public_order_id: 'IPT-A1B2C3D4',
        product_id: 'premium_12m',
        plan: 'Premium',
        duration_months: 12,
        price: 99.99,
        currency: 'EUR',
        status: 'pending',
        telegram_user_id: null,
        telegram_username: null,
        telegram_first_name: null,
        telegram_last_name: null,
        telegram_language_code: null,
        telegram_start_message_id: null,
        customer_message_id: null,
        admin_message_id: null,
        ...overrides
    };
}

export function testConfig(overrides = {}) {
    return {
        telegramAdminId: '999',
        payment: {
            methodName: 'Bank Transfer',
            recipient: 'IPTVantage',
            iban: 'TEST-IBAN',
            instructions: 'Use the order number as your reference.'
        },
        ...overrides
    };
}
