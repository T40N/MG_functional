/**
 * S5 — Add to cart  POST /api/cart/items
 *
 * Characteristics: JWT verify + stock validation + conditional upsert.
 * Each VU uses its own seed user (seed_N@test.com) to avoid UNIQUE(user_id, product_id)
 * conflicts between concurrent VUs. Login is done once per VU on first iteration
 * and tagged { type: 'setup_login' } so it can be filtered from analysis.
 * Hypothesis: complex effect management — differences in RTE chain vs async/await.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s5_B_functional.json \
 *     benchmarks/k6/scenarios/s5_add_to_cart.js
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

// VU-local token — persists across iterations for the same VU
let token = null;

export default function () {
  // Login once per VU
  if (!token) {
    token = seedLogin(BASE_URL, __VU);
  }

  // Spread product IDs across the catalog; coprime offsets avoid hot rows
  const productId = ((__VU * 7919 + __ITER * 1009) % PRODUCT_COUNT) + 1;

  const res = http.post(
    `${BASE_URL}/api/cart/items`,
    JSON.stringify({ productId, quantity: 1 }),
    { headers: { ...HEADERS, Authorization: `Bearer ${token}` } },
  );

  const ok = check(res, {
    'status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'has cart item':     (r) => Boolean(r.json('data')),
  });
  businessSuccess.add(ok);
}
