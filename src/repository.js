import { MongoClient, ObjectId } from 'mongodb';

function wrapDatabaseError(error, operation) {
    const wrapped = new Error(`Database operation failed: ${operation}`);
    wrapped.cause = error;
    return wrapped;
}

function normalizeOrder(document) {
    if (!document) return null;
    const { _id, ...order } = document;
    return { id: _id.toHexString(), ...order };
}

export function createOrderRepository({ mongoDbUri, mongoDbName, isProduction }) {
    if (!mongoDbUri) return isProduction ? null : new MemoryOrderRepository();

    const client = new MongoClient(mongoDbUri, {
        appName: 'VantagePay',
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 10_000
    });
    return new MongoOrderRepository(client, mongoDbName);
}

export class MongoOrderRepository {
    constructor(client, databaseName = 'iptvantage') {
        this.client = client;
        this.databaseName = databaseName;
        this.collection = null;
        this.readyPromise = null;
    }

    async ready() {
        if (!this.readyPromise) {
            this.readyPromise = (async () => {
                await this.client.connect();
                this.collection = this.client.db(this.databaseName).collection('orders');
                await Promise.all([
                    this.collection.createIndex({ public_order_id: 1 }, { unique: true }),
                    this.collection.createIndex(
                        { telegram_user_id: 1, telegram_start_message_id: 1 },
                        {
                            unique: true,
                            partialFilterExpression: { telegram_start_message_id: { $type: 'number' } }
                        }
                    ),
                    this.collection.createIndex({ telegram_user_id: 1, created_at: -1 }),
                    this.collection.createIndex({ status: 1, created_at: -1 }),
                    this.collection.createIndex({ client_id: 1 }, { unique: true, sparse: true })
                ]);
            })();
        }

        try {
            await this.readyPromise;
        } catch (error) {
            throw wrapDatabaseError(error, 'connect to MongoDB');
        }
    }

    async run(operation, action) {
        await this.ready();
        try {
            return await action();
        } catch (error) {
            throw wrapDatabaseError(error, operation);
        }
    }

    async createOrder(order) {
        return this.run('create order', async () => {
            const document = {
                customer_message_id: null,
                admin_message_id: null,
                updated_at: order.created_at,
                payment_submitted_at: null,
                paid_at: null,
                rejected_at: null,
                approved_by: null,
                ...order
            };
            const result = await this.collection.insertOne(document);
            return normalizeOrder({ _id: result.insertedId, ...document });
        });
    }

    async findByTelegramStartMessage(telegramUserId, startMessageId) {
        if (!startMessageId) return null;
        return this.run('find Telegram start message', async () => normalizeOrder(
            await this.collection.findOne({
                telegram_user_id: String(telegramUserId),
                telegram_start_message_id: startMessageId
            })
        ));
    }

    async findByPublicOrderId(publicOrderId) {
        return this.run('find public order', async () => normalizeOrder(
            await this.collection.findOne({ public_order_id: publicOrderId })
        ));
    }

    async findById(id) {
        if (!ObjectId.isValid(String(id))) return null;
        return this.run('find order', async () => normalizeOrder(
            await this.collection.findOne({ _id: new ObjectId(String(id)) })
        ));
    }

    async findByClientId(clientId) {
        return this.run('find client ID', async () => normalizeOrder(
            await this.collection.findOne({ client_id: clientId })
        ));
    }

    async updateMessageIds(id, values) {
        if (!ObjectId.isValid(String(id))) return null;
        const updates = {};
        if (values.customer_message_id !== undefined) {
            updates.customer_message_id = values.customer_message_id;
        }
        if (values.admin_message_id !== undefined) {
            updates.admin_message_id = values.admin_message_id;
        }
        if (Object.keys(updates).length === 0) return this.findById(id);

        return this.run('update Telegram message references', async () => normalizeOrder(
            await this.collection.findOneAndUpdate(
                { _id: new ObjectId(String(id)) },
                { $set: { ...updates, updated_at: new Date().toISOString() } },
                { returnDocument: 'after', includeResultMetadata: false }
            )
        ));
    }

    async listByTelegramUserId(telegramUserId, limit = 10) {
        const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 10);
        return this.run('list customer orders', async () => {
            const documents = await this.collection
                .find({ telegram_user_id: String(telegramUserId) })
                .sort({ created_at: -1 })
                .limit(safeLimit)
                .toArray();
            return documents.map(normalizeOrder);
        });
    }

    async transitionStatus(id, fromStatus, toStatus, updates = {}) {
        if (!ObjectId.isValid(String(id))) return { changed: false, order: null };
        const allowedFields = [
            'payment_submitted_at',
            'paid_at',
            'rejected_at',
            'approved_by',
            'fulfilled_at',
            'account_username',
            'account_password',
            'account_url',
            'application_name',
            'client_id',
            'expires_at',
            'country'
        ];
        const safeUpdates = Object.fromEntries(
            allowedFields
                .filter((field) => updates[field] !== undefined)
                .map((field) => [field, updates[field]])
        );

        const order = await this.run('change order status', async () => normalizeOrder(
            await this.collection.findOneAndUpdate(
                { _id: new ObjectId(String(id)), status: fromStatus },
                {
                    $set: {
                        status: toStatus,
                        ...safeUpdates,
                        updated_at: new Date().toISOString()
                    }
                },
                { returnDocument: 'after', includeResultMetadata: false }
            )
        ));

        if (order) return { changed: true, order };
        return { changed: false, order: await this.findById(id) };
    }

    close() {
        return this.client.close();
    }
}

export class MemoryOrderRepository {
    constructor() {
        this.orders = [];
        this.nextId = 1;
    }

    async createOrder(order) {
        const created = {
            id: String(this.nextId++),
            customer_message_id: null,
            admin_message_id: null,
            updated_at: order.created_at,
            payment_submitted_at: null,
            paid_at: null,
            rejected_at: null,
            approved_by: null,
            ...order
        };
        this.orders.push(created);
        return created;
    }

    async findByTelegramStartMessage(telegramUserId, startMessageId) {
        if (!startMessageId) return null;
        return this.orders.find((order) =>
            String(order.telegram_user_id) === String(telegramUserId)
            && String(order.telegram_start_message_id) === String(startMessageId)) || null;
    }

    async findByPublicOrderId(publicOrderId) {
        return this.orders.find((order) => order.public_order_id === publicOrderId) || null;
    }

    async findById(id) {
        return this.orders.find((order) => String(order.id) === String(id)) || null;
    }

    async findByClientId(clientId) {
        return this.orders.find((order) => order.client_id === clientId) || null;
    }

    async updateMessageIds(id, values) {
        const order = await this.findById(id);
        if (!order) return null;
        if (values.customer_message_id !== undefined) order.customer_message_id = values.customer_message_id;
        if (values.admin_message_id !== undefined) order.admin_message_id = values.admin_message_id;
        order.updated_at = new Date().toISOString();
        return order;
    }

    async listByTelegramUserId(telegramUserId, limit = 10) {
        return this.orders
            .filter((order) => String(order.telegram_user_id) === String(telegramUserId))
            .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
            .slice(0, Math.min(limit, 10));
    }

    async transitionStatus(id, fromStatus, toStatus, updates = {}) {
        const order = await this.findById(id);
        if (!order || order.status !== fromStatus) return { changed: false, order };
        Object.assign(order, { status: toStatus, ...updates, updated_at: new Date().toISOString() });
        return { changed: true, order };
    }

    async close() {}
}
