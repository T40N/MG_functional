/**
 * S6 — Place order  POST /api/orders
 *
 * Characteristics: JWT verify + full PostgreSQL transaction (FOR UPDATE, stock
 * deduction, cart clear). Most important scenario — complex business logic.
 * Hypothesis: RTE chain creates more closures vs linear async/await; largest
 *             structural difference between implementations.
 *
 * Each iteration:
 *   1. Add a product to cart (prerequisite — cart cleared after each order)
 *   2. Place order (the benchmarked operation)
 *
 * Each VU uses its own seed user for cart isolation.
 * Login tagged { type: 'setup_login' }, cart-add tagged { type: 'setup_cart' }
 * so both can be filtered from the core order-placement metrics in analysis.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s6_B_functional.json \
 *     benchmarks/k6/scenarios/s6_place_order.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { getOptions } from '../helpers/profiles.js';
import { seedLogin, HEADERS } from '../helpers/auth.js';

const BASE_URL      = __ENV.BASE_URL   || 'http://localhost:3000';
const PRODUCT_COUNT = 100000;

export const options = getOptions(__ENV.PROFILE || 'A');

const businessSuccess = new Rate('business_success');
const orderPlaced     = new Rate('order_placed');

let token = null;

export default function () {
  // Step 1: login once per VU
  if (!token) {
    token = seedLogin(BASE_URL, __VU);
  }

  const authHeaders = { ...HEADERS, Authorization: `Bearer ${token}` };

  // Step 2: add one product to cart (prerequisite — tagged as setup)
  const productId = ((__VU * 7919 + __ITER * 1009) % PRODUCT_COUNT) + 1;

  const cartRes = http.post(
    `${BASE_URL}/api/cart/items`,
    JSON.stringify({ productId, quantity: 1 }),
    { headers: authHeaders, tags: { type: 'setup_cart' } },
  );

  if (cartRes.status !== 200 && cartRes.status !== 201) {
    // Cart add failed (likely out of stock) — skip order placement
    businessSuccess.add(false);
    orderPlaced.add(false);
    return;
  }

  // Step 3: place order — the core benchmarked operation
  const orderRes = http.post(
    `${BASE_URL}/api/orders`,
    null,
    { headers: authHeaders },
  );

  const ok = check(orderRes, {
    'status 201':  (r) => r.status === 201,
    'has order id': (r) => Boolean(r.json('data.id')),
  });

  businessSuccess.add(ok);
  orderPlaced.add(ok);
}
