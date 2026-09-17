import { randomBytes } from 'node:crypto';
import { InvalidProductError } from './order-service.js';
import { ORDER_STATUSES } from '../subscription-plans.mjs';

const ADMIN_FORM_FIELDS = Object.freeze([
    Object.freeze({ key: 'account_username', label: 'Username', prompt: '<b>Step 1/4 — Username</b>\n\nSend the IPTV account username.' }),
    Object.freeze({ key: 'account_password', label: 'Password', prompt: '<b>Step 2/4 — Password</b>\n\nSend the IPTV account password.' }),
    Object.freeze({ key: 'account_url', label: 'URL', prompt: '<b>Step 3/4 — URL</b>\n\nSend the full IPTV server URL, beginning with http:// or https://.' }),
    Object.freeze({ key: 'application_name', label: 'Application', prompt: '<b>Step 4/4 — Application</b>\n\nSend the application name or download information.' })
]);

const CLIENT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const STATUS_LABELS = Object.freeze({
    [ORDER_STATUSES.PENDING]: '🟡 Waiting for Payment',
    [ORDER_STATUSES.PAYMENT_SUBMITTED]: '🟠 Payment Submitted',
    [ORDER_STATUSES.PAID]: '🟢 Paid',
    [ORDER_STATUSES.REJECTED]: '🔴 Rejected',
    [ORDER_STATUSES.CANCELLED]: '⚫ Cancelled'
});

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function formatPrice(order) {
    return `€${Number(order.price).toFixed(2)}`;
}

function formatDuration(months) {
    return `${months} ${Number(months) === 1 ? 'Month' : 'Months'}`;
}

function addSubscriptionMonths(date, months) {
    const source = new Date(date);
    const result = new Date(source);
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + Number(months));
    const lastDay = new Date(Date.UTC(
        result.getUTCFullYear(),
        result.getUTCMonth() + 1,
        0
    )).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDay));
    return result;
}

function formatExpiry(date) {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(date));
}

function countryFromTelegramLanguageCode(languageCode) {
    const locale = String(languageCode || '').replace('_', '-');
    const region = locale.split('-').find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
    if (!region) return 'Not provided by Telegram';

    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase())
            || 'Not provided by Telegram';
    } catch {
        return 'Not provided by Telegram';
    }
}

function generateClientId() {
    const bytes = randomBytes(5);
    return Array.from(bytes, (byte) => CLIENT_ID_ALPHABET[byte % CLIENT_ID_ALPHABET.length]).join('');
}

function tierIcon(plan) {
    return String(plan).toLowerCase() === 'premium' ? '💎' : '📺';
}

function paymentInstructions(config, order) {
    const lines = [];
    if (config.payment.methodName) lines.push(`<b>Payment Method:</b> ${escapeHtml(config.payment.methodName)}`);
    if (config.payment.recipient) lines.push(`<b>Recipient:</b> ${escapeHtml(config.payment.recipient)}`);
    if (config.payment.iban) lines.push(`<b>IBAN / Account:</b> <code>${escapeHtml(config.payment.iban)}</code>`);
    if (config.payment.instructions) lines.push(escapeHtml(config.payment.instructions));

    if (lines.length === 0) {
        return 'Payment instructions are temporarily unavailable. Please contact IPTVantage support.';
    }

    lines.push(`<b>Reference:</b> <code>${escapeHtml(order.public_order_id)}</code>`);
    return lines.join('\n');
}

function customerOrderMessage(order, config, { includeInstructions = false } = {}) {
    const lines = [
        '🎬 <b>IPTVantage</b>',
        '',
        `Order #${escapeHtml(order.public_order_id)}`,
        '',
        `${tierIcon(order.plan)} <b>${escapeHtml(order.plan)}</b>`,
        `📅 ${formatDuration(order.duration_months)}`,
        `💶 ${formatPrice(order)}`,
        '',
        '<b>Payment Status:</b>',
        STATUS_LABELS[order.status] || escapeHtml(order.status)
    ];

    if (includeInstructions) {
        lines.push('', paymentInstructions(config, order));
    }

    if (order.status === ORDER_STATUSES.PAYMENT_SUBMITTED) {
        lines.push('', 'Your payment is waiting for confirmation.');
    } else if (order.status === ORDER_STATUSES.PAID) {
        lines.push('', 'Your IPTVantage payment has been confirmed.', '',
            'Further subscription/account details will be sent separately.');
    } else if (order.status === ORDER_STATUSES.REJECTED) {
        lines.push('', 'Payment could not be confirmed. Please verify your payment or contact support.');
    }

    return lines.join('\n');
}

function adminOrderMessage(order) {
    const displayName = [order.telegram_first_name, order.telegram_last_name].filter(Boolean).join(' ') || 'Not provided';
    const username = order.telegram_username ? `@${order.telegram_username}` : 'Not provided';
    const title = order.status === ORDER_STATUSES.PAID
        ? '✅ <b>PAYMENT CONFIRMED</b>'
        : order.status === ORDER_STATUSES.REJECTED
            ? '❌ <b>PAYMENT REJECTED</b>'
            : '💰 <b>PAYMENT SUBMITTED</b>';

    return [
        title,
        '',
        `<b>Order:</b> #${escapeHtml(order.public_order_id)}`,
        '',
        `<b>Customer:</b> ${escapeHtml(displayName)}`,
        `<b>Telegram:</b> ${escapeHtml(username)}`,
        `<b>Telegram ID:</b> <code>${escapeHtml(order.telegram_user_id)}</code>`,
        '',
        `<b>Plan:</b> ${tierIcon(order.plan)} ${escapeHtml(order.plan)}`,
        `<b>Duration:</b> ${formatDuration(order.duration_months)}`,
        `<b>Price:</b> ${formatPrice(order)}`,
        `<b>Status:</b> ${STATUS_LABELS[order.status] || escapeHtml(order.status)}`
    ].join('\n');
}

function customerAccountMessage(order) {
    return [
        '<b><i>IPTVantage</i></b>',
        '',
        `<b><i>🟩 ${escapeHtml(order.plan)} — ${formatDuration(order.duration_months)} 🟩</i></b>`,
        '',
        '<b>👤Name : iptvantage</b>',
        `<b>👤Username : ${escapeHtml(order.account_username)}</b>`,
        `<b>🔒Password : ${escapeHtml(order.account_password)}</b>`,
        `<b>⛓ URL : ${escapeHtml(order.account_url)}</b>`,
        '',
        `<b>🕔EXP : ${formatExpiry(order.expires_at)}</b>`,
        `<b>⬇️Application : ${escapeHtml(order.application_name)}</b>`,
        `<b>🆔 : ${escapeHtml(order.client_id)}</b>`,
        `<b>🌍Country : ${escapeHtml(order.country)}</b>`,
        '',
        '<b>Telegram : @iptvantage</b>',
        '<b><i>Website : <a href="https://iptvantage.net">https://iptvantage.net</a></i></b>',
        '',
        '<b>🟢ACTIVE🟢</b>'
    ].join('\n');
}

function customerKeyboard(order) {
    if (order.status !== ORDER_STATUSES.PENDING) return undefined;
    return {
        inline_keyboard: [[{
            text: '✅ I HAVE PAID',
            callback_data: `payment_submitted:${order.public_order_id}`
        }]]
    };
}

function adminKeyboard(order) {
    if (order.status !== ORDER_STATUSES.PAYMENT_SUBMITTED) return undefined;
    return {
        inline_keyboard: [
            [{ text: '📝 ADD ACCOUNT & MARK PAID', callback_data: `admin_paid:${order.public_order_id}` }],
            [{ text: '❌ REJECT', callback_data: `admin_reject:${order.public_order_id}` }]
        ]
    };
}

function fulfillmentKeyboard(order) {
    return {
        inline_keyboard: [
            [{ text: '✅ CONFIRM, MARK PAID & SEND', callback_data: `admin_fulfill:${order.public_order_id}` }],
            [{ text: '✏️ START OVER', callback_data: `admin_restart:${order.public_order_id}` }],
            [{ text: '❌ CANCEL', callback_data: `admin_cancel:${order.public_order_id}` }]
        ]
    };
}

function messageOptions(replyMarkup) {
    return {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    };
}

function isUnchangedMessageError(error) {
    return /message is not modified/i.test(error?.message || '');
}

function validateAdminField(field, value) {
    const normalized = String(value || '').trim();
    if (!normalized) return { error: `${field.label} cannot be empty.` };

    const limits = {
        account_username: 128,
        account_password: 256,
        account_url: 2048,
        application_name: 256
    };
    if (normalized.length > limits[field.key]) {
        return { error: `${field.label} is too long.` };
    }

    if (field.key === 'account_url') {
        try {
            const url = new URL(normalized);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol.');
        } catch {
            return { error: 'URL must be a complete http:// or https:// address.' };
        }
    }

    return { value: normalized };
}

export function createBotHandler({ repository, telegram, config, orderService, now = () => new Date() }) {
    const adminDrafts = new Map();

    async function editOrSendCustomer(order, text, replyMarkup, preferredMessage) {
        const chatId = String(order.telegram_user_id);
        const messageId = preferredMessage?.message_id || order.customer_message_id;

        if (messageId) {
            try {
                await telegram.editMessageText(chatId, messageId, text, messageOptions(replyMarkup));
                if (String(order.customer_message_id || '') !== String(messageId)) {
                    await repository.updateMessageIds(order.id, { customer_message_id: messageId });
                }
                return messageId;
            } catch (error) {
                if (isUnchangedMessageError(error)) return messageId;
                // Telegram may reject edits to old or unchanged messages; send a replacement below.
            }
        }

        const sent = await telegram.sendMessage(chatId, text, messageOptions(replyMarkup));
        await repository.updateMessageIds(order.id, { customer_message_id: sent.message_id });
        return sent.message_id;
    }

    async function notifyAdmin(order) {
        if (order.admin_message_id) return order.admin_message_id;
        const sent = await telegram.sendMessage(
            config.telegramAdminId,
            adminOrderMessage(order),
            messageOptions(adminKeyboard(order))
        );
        await repository.updateMessageIds(order.id, { admin_message_id: sent.message_id });
        return sent.message_id;
    }

    async function handleStart(message, productId) {
        const chatId = message.chat.id;
        if (!productId) {
            await telegram.sendMessage(chatId,
                'Open IPTVantage, choose a subscription, and use its Subscribe button to begin.',
                messageOptions());
            return;
        }

        let order;
        try {
            order = await orderService.createOrder(productId, message.from, message.message_id);
        } catch (error) {
            if (!(error instanceof InvalidProductError)) throw error;
            await telegram.sendMessage(chatId,
                'This subscription option is invalid. Please return to IPTVantage and select a current plan.',
                messageOptions());
            return;
        }

        await editOrSendCustomer(
            order,
            customerOrderMessage(order, config, {
                includeInstructions: order.status === ORDER_STATUSES.PENDING
            }),
            customerKeyboard(order)
        );
    }

    async function handleMyOrders(message) {
        const orders = await repository.listByTelegramUserId(message.from.id, 10);
        if (orders.length === 0) {
            await telegram.sendMessage(message.chat.id,
                'You do not have any IPTVantage orders linked to this Telegram account yet.',
                messageOptions());
            return;
        }

        const entries = orders.map((order) => [
            `#${escapeHtml(order.public_order_id)}`,
            `${escapeHtml(order.plan)} • ${formatDuration(order.duration_months)}`,
            formatPrice(order),
            STATUS_LABELS[order.status] || escapeHtml(order.status)
        ].join('\n'));

        await telegram.sendMessage(message.chat.id,
            ['<b>Your IPTVantage Orders</b>', '', ...entries.flatMap((entry, index) =>
                index === entries.length - 1 ? [entry] : [entry, ''])].join('\n'),
            messageOptions());
    }

    async function createAvailableClientId() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const clientId = generateClientId();
            const existing = await repository.findByClientId?.(clientId);
            if (!existing) return clientId;
        }
        throw new Error('Unable to allocate a unique client ID.');
    }

    async function sendAdminFormPrompt(draft) {
        const field = ADMIN_FORM_FIELDS[draft.step];
        const sent = await telegram.sendMessage(
            draft.chatId,
            [`<b>Order #${escapeHtml(draft.publicOrderId)}</b>`, '', field.prompt, '', 'Send /cancel to stop.'].join('\n'),
            messageOptions({ force_reply: true, selective: true })
        );
        draft.cleanupMessageIds.push(sent.message_id);
    }

    async function prepareFulfillmentPreview(draft) {
        const order = await repository.findByPublicOrderId(draft.publicOrderId);
        if (!order || order.status !== ORDER_STATUSES.PAYMENT_SUBMITTED) {
            adminDrafts.delete(draft.adminId);
            await telegram.sendMessage(draft.chatId,
                'This order is no longer waiting for account details.',
                messageOptions());
            return;
        }

        draft.fulfillment = {
            ...draft.values,
            client_id: await createAvailableClientId(),
            expires_at: addSubscriptionMonths(now(), order.duration_months).toISOString(),
            country: countryFromTelegramLanguageCode(order.telegram_language_code)
        };
        draft.step = ADMIN_FORM_FIELDS.length;

        const preview = await telegram.sendMessage(
            draft.chatId,
            [
                '<b>Review account before marking the payment paid</b>',
                `<b>Order:</b> #${escapeHtml(order.public_order_id)}`,
                '',
                customerAccountMessage({ ...order, ...draft.fulfillment })
            ].join('\n'),
            messageOptions(fulfillmentKeyboard(order))
        );
        draft.previewMessageId = preview.message_id;
    }

    async function cleanupAdminFormMessages(draft) {
        if (!telegram.deleteMessage) return;
        const messageIds = [...new Set(draft.cleanupMessageIds)];
        await Promise.allSettled(messageIds.map((messageId) =>
            telegram.deleteMessage(draft.chatId, messageId)));
    }

    async function handleAdminDraftMessage(message) {
        const adminId = String(message.from.id);
        if (adminId !== String(config.telegramAdminId)) return false;

        const draft = adminDrafts.get(adminId);
        if (!draft) return false;

        if (/^\/cancel(?:@\w+)?$/i.test(message.text.trim())) {
            adminDrafts.delete(adminId);
            await telegram.sendMessage(message.chat.id, 'Account form cancelled.', messageOptions());
            return true;
        }

        if (draft.step >= ADMIN_FORM_FIELDS.length) {
            await telegram.sendMessage(message.chat.id,
                'Use the confirmation buttons below the account preview, or send /cancel.',
                messageOptions());
            return true;
        }

        draft.cleanupMessageIds.push(message.message_id);
        const field = ADMIN_FORM_FIELDS[draft.step];
        const validated = validateAdminField(field, message.text);
        if (validated.error) {
            const sent = await telegram.sendMessage(
                message.chat.id,
                `${escapeHtml(validated.error)}\n\n${field.prompt}`,
                messageOptions({ force_reply: true, selective: true })
            );
            draft.cleanupMessageIds.push(sent.message_id);
            return true;
        }

        draft.values[field.key] = validated.value;
        draft.step += 1;
        if (draft.step < ADMIN_FORM_FIELDS.length) {
            await sendAdminFormPrompt(draft);
        } else {
            await prepareFulfillmentPreview(draft);
        }
        return true;
    }

    async function handleMessage(message) {
        if (!message?.text || !message.from || !message.chat) return;
        const text = message.text.trim();
        const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([^\s]+))?$/i);

        if (await handleAdminDraftMessage(message)) {
            return;
        } else if (startMatch) {
            await handleStart(message, startMatch[1]);
        } else if (/^\/myorders(?:@\w+)?$/i.test(text)) {
            await handleMyOrders(message);
        } else if (/^\/help(?:@\w+)?$/i.test(text)) {
            await telegram.sendMessage(message.chat.id,
                '<b>IPTVantage Help</b>\n\nUse /myorders to view your orders. For payment or account help, contact IPTVantage support.',
                messageOptions());
        }
    }

    async function processCustomerSubmission(query, order) {
        if (String(order.telegram_user_id || '') !== String(query.from.id)) {
            return { text: 'This order is not linked to your Telegram account.', show_alert: true };
        }

        const transition = await repository.transitionStatus(
            order.id,
            ORDER_STATUSES.PENDING,
            ORDER_STATUSES.PAYMENT_SUBMITTED,
            { payment_submitted_at: now().toISOString() }
        );
        const current = transition.order;

        if (!current) return { text: 'Order not found.', show_alert: true };
        if (!transition.changed && current.status !== ORDER_STATUSES.PAYMENT_SUBMITTED) {
            return { text: `This order is already ${current.status.replaceAll('_', ' ')}.`, show_alert: true };
        }

        await editOrSendCustomer(
            current,
            customerOrderMessage(current, config),
            undefined,
            query.message
        );
        await notifyAdmin(current);
        return { text: transition.changed ? 'Payment submitted for review.' : 'Payment was already submitted.' };
    }

    async function editAdminMessage(order, query) {
        const chatId = query.message?.chat?.id || config.telegramAdminId;
        const messageId = order.admin_message_id || query.message?.message_id;
        if (!messageId) return;
        try {
            await telegram.editMessageText(chatId, messageId, adminOrderMessage(order), messageOptions());
        } catch (error) {
            if (!isUnchangedMessageError(error)) throw error;
        }
    }

    function isAdmin(query) {
        return String(query.from.id) === String(config.telegramAdminId);
    }

    async function startAdminFulfillment(query, order) {
        if (!isAdmin(query)) {
            return { text: 'You are not authorized to manage payments.', show_alert: true };
        }
        if (order.status !== ORDER_STATUSES.PAYMENT_SUBMITTED) {
            return { text: `Order is ${order.status.replaceAll('_', ' ')} and cannot be fulfilled.`, show_alert: true };
        }

        const adminId = String(query.from.id);
        const previousDraft = adminDrafts.get(adminId);
        const draft = {
            adminId,
            chatId: String(query.message?.chat?.id || config.telegramAdminId),
            publicOrderId: order.public_order_id,
            step: 0,
            values: {},
            fulfillment: null,
            cleanupMessageIds: previousDraft?.publicOrderId === order.public_order_id
                ? previousDraft.cleanupMessageIds
                : [],
            previewMessageId: null
        };
        adminDrafts.set(adminId, draft);
        await sendAdminFormPrompt(draft);
        return { text: 'Account form started. Send the username in this chat.' };
    }

    async function restartAdminFulfillment(query, order) {
        const draft = adminDrafts.get(String(query.from.id));
        if (draft?.publicOrderId === order.public_order_id && draft.previewMessageId) {
            draft.cleanupMessageIds.push(draft.previewMessageId);
        }
        return startAdminFulfillment(query, order);
    }

    async function cancelAdminFulfillment(query, order) {
        if (!isAdmin(query)) {
            return { text: 'You are not authorized to manage payments.', show_alert: true };
        }
        const adminId = String(query.from.id);
        const draft = adminDrafts.get(adminId);
        if (draft?.publicOrderId === order.public_order_id) adminDrafts.delete(adminId);
        return { text: 'Account form cancelled.' };
    }

    async function rejectOrder(query, order) {
        if (String(query.from.id) !== String(config.telegramAdminId)) {
            return { text: 'You are not authorized to manage payments.', show_alert: true };
        }

        const transition = await repository.transitionStatus(
            order.id,
            ORDER_STATUSES.PAYMENT_SUBMITTED,
            ORDER_STATUSES.REJECTED,
            { rejected_at: now().toISOString() }
        );
        const current = transition.order;

        if (!current) return { text: 'Order not found.', show_alert: true };
        if (!transition.changed && current.status !== ORDER_STATUSES.REJECTED) {
            return { text: `Order is ${current.status.replaceAll('_', ' ')} and cannot be changed.`, show_alert: true };
        }

        const draft = adminDrafts.get(String(query.from.id));
        if (draft?.publicOrderId === order.public_order_id) adminDrafts.delete(String(query.from.id));
        await editAdminMessage(current, query);
        if (current.telegram_user_id) {
            await editOrSendCustomer(current, customerOrderMessage(current, config));
        }

        return { text: transition.changed ? 'Payment rejected.' : 'Payment was already rejected.' };
    }

    async function confirmFulfillment(query, order) {
        if (!isAdmin(query)) {
            return { text: 'You are not authorized to manage payments.', show_alert: true };
        }

        const adminId = String(query.from.id);
        const draft = adminDrafts.get(adminId);
        if (!draft || draft.publicOrderId !== order.public_order_id || !draft.fulfillment) {
            return { text: 'No completed account form exists for this order.', show_alert: true };
        }

        if (order.status === ORDER_STATUSES.PAID && order.client_id) {
            await telegram.sendMessage(order.telegram_user_id, customerAccountMessage(order), messageOptions());
            await cleanupAdminFormMessages(draft);
            adminDrafts.delete(adminId);
            return { text: 'Account details sent again.' };
        }
        if (order.status !== ORDER_STATUSES.PAYMENT_SUBMITTED) {
            return { text: `Order is ${order.status.replaceAll('_', ' ')} and cannot be fulfilled.`, show_alert: true };
        }

        let transition;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                transition = await repository.transitionStatus(
                    order.id,
                    ORDER_STATUSES.PAYMENT_SUBMITTED,
                    ORDER_STATUSES.PAID,
                    {
                        ...draft.fulfillment,
                        paid_at: now().toISOString(),
                        fulfilled_at: now().toISOString(),
                        approved_by: adminId
                    }
                );
                break;
            } catch (error) {
                const duplicateClientId = error?.cause?.code === 11000 || error?.cause?.code === 11001;
                if (!duplicateClientId || attempt === 4) throw error;
                draft.fulfillment.client_id = await createAvailableClientId();
            }
        }

        const current = transition?.order;
        if (!current) return { text: 'Order not found.', show_alert: true };
        if (!transition.changed && current.status !== ORDER_STATUSES.PAID) {
            return { text: `Order is ${current.status.replaceAll('_', ' ')} and cannot be fulfilled.`, show_alert: true };
        }

        await editAdminMessage(current, query);
        if (current.telegram_user_id) {
            await editOrSendCustomer(current, customerOrderMessage(current, config));
            await telegram.sendMessage(current.telegram_user_id, customerAccountMessage(current), messageOptions());
        }

        if (query.message?.message_id && String(query.message.message_id) !== String(current.admin_message_id || '')) {
            await telegram.editMessageText(
                query.message.chat.id,
                query.message.message_id,
                `<b>✅ Account activated and sent</b>\n\nOrder #${escapeHtml(current.public_order_id)}\nClient ID: <code>${escapeHtml(current.client_id)}</code>`,
                messageOptions()
            ).catch(() => {});
        }

        await cleanupAdminFormMessages(draft);
        adminDrafts.delete(adminId);
        return { text: 'Payment marked paid and account details sent.' };
    }

    async function handleCallback(query) {
        let answer = { text: 'Unsupported action.', show_alert: true };
        let failure;

        try {
            const match = String(query.data || '').match(/^(payment_submitted|admin_paid|admin_reject|admin_fulfill|admin_restart|admin_cancel):(IPT-[A-F0-9]{8,16})$/);
            if (!match || !query.from) return;

            const [, action, publicOrderId] = match;
            const order = await repository.findByPublicOrderId(publicOrderId);
            if (!order) {
                answer = { text: 'Order not found.', show_alert: true };
            } else if (action === 'payment_submitted') {
                answer = await processCustomerSubmission(query, order);
            } else if (action === 'admin_paid') {
                answer = await startAdminFulfillment(query, order);
            } else if (action === 'admin_reject') {
                answer = await rejectOrder(query, order);
            } else if (action === 'admin_fulfill') {
                answer = await confirmFulfillment(query, order);
            } else if (action === 'admin_restart') {
                answer = await restartAdminFulfillment(query, order);
            } else {
                answer = await cancelAdminFulfillment(query, order);
            }
        } catch (error) {
            answer = { text: 'Unable to process this action right now.', show_alert: true };
            failure = error;
        } finally {
            if (query.id) {
                await telegram.answerCallbackQuery(query.id, answer).catch(() => {});
            }
        }

        if (failure) throw failure;
    }

    async function handleUpdate(update) {
        if (update?.callback_query) return handleCallback(update.callback_query);
        if (update?.message) return handleMessage(update.message);
    }

    return Object.freeze({ handleUpdate });
}

export const botFormatting = Object.freeze({
    customerOrderMessage,
    customerAccountMessage,
    adminOrderMessage,
    addSubscriptionMonths,
    countryFromTelegramLanguageCode,
    formatDuration,
    formatPrice
});
