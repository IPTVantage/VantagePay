import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductById, SUBSCRIPTION_PLANS } from '../subscription-plans.mjs';

const expected = {
    standard_1m: 14.99,
    standard_3m: 34.99,
    standard_6m: 49.99,
    standard_12m: 69.99,
    gold_3m: 44.99,
    gold_6m: 59.99,
    gold_12m: 84.99,
    premium_6m: 74.99,
    premium_12m: 99.99
};

test('all nine subscription products have their exact authoritative prices', () => {
    assert.equal(Object.values(SUBSCRIPTION_PLANS).flatMap((plan) => plan.durations).length, 9);
    for (const [productId, price] of Object.entries(expected)) {
        assert.equal(getProductById(productId)?.price, price, productId);
    }
});

test('Premium 1 Year is exactly €99.99 and marked BEST VALUE', () => {
    const product = getProductById('premium_12m');
    assert.equal(product.price, 99.99);
    assert.equal(product.durationMonths, 12);
    assert.equal(product.badge, 'BEST VALUE');
});

test('unknown products are rejected by the bot catalog', () => {
    assert.equal(getProductById('premium_99'), null);
    assert.equal(getProductById(''), null);
});
