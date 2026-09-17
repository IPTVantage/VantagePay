// Keep the bot's product catalog inside the bot repository so production
// deployments never depend on files from the separate static website.
export const SUBSCRIPTION_PLANS = Object.freeze({
    standard: Object.freeze({
        id: 'standard',
        name: 'Standard',
        description: 'Everything you need to start streaming',
        durations: Object.freeze([
            Object.freeze({ id: 'standard_1m', months: 1, label: '1 Month', price: 14.99 }),
            Object.freeze({ id: 'standard_3m', months: 3, label: '3 Months', price: 34.99 }),
            Object.freeze({ id: 'standard_6m', months: 6, label: '6 Months', price: 49.99 }),
            Object.freeze({ id: 'standard_12m', months: 12, label: '1 Year', price: 69.99 })
        ])
    }),
    gold: Object.freeze({
        id: 'gold',
        name: 'Gold',
        description: 'More value for committed viewers',
        durations: Object.freeze([
            Object.freeze({ id: 'gold_3m', months: 3, label: '3 Months', price: 44.99 }),
            Object.freeze({ id: 'gold_6m', months: 6, label: '6 Months', price: 59.99 }),
            Object.freeze({ id: 'gold_12m', months: 12, label: '1 Year', price: 84.99 })
        ])
    }),
    premium: Object.freeze({
        id: 'premium',
        name: 'Premium',
        description: 'The ultimate IPTV experience',
        durations: Object.freeze([
            Object.freeze({ id: 'premium_6m', months: 6, label: '6 Months', price: 74.99 }),
            Object.freeze({
                id: 'premium_12m',
                months: 12,
                label: '1 Year',
                price: 99.99,
                badge: 'BEST VALUE'
            })
        ])
    })
});

export const ORDER_STATUSES = Object.freeze({
    PENDING: 'pending',
    PAYMENT_SUBMITTED: 'payment_submitted',
    PAID: 'paid',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled'
});

export function getProductById(productId) {
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
        const duration = plan.durations.find((option) => option.id === productId);
        if (duration) {
            return Object.freeze({
                productId: duration.id,
                planId: plan.id,
                planName: plan.name,
                durationMonths: duration.months,
                durationLabel: duration.label,
                price: duration.price,
                currency: 'EUR',
                badge: duration.badge || null
            });
        }
    }

    return null;
}
