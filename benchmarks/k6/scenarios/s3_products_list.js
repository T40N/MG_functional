/**
 * S3 — Product list  GET /api/products
 *
 * Characteristics: pure DB read across 100 000 products, no crypto.
 * Hypothesis: architectural overhead most visible here — fp-ts chain vs async/await.
 * Pages and categories rotated to prevent query-plan caching effects.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s3_B_functional.json \
 *     benchmarks/k6/scenarios/s3_products_list.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { getOptions } from '../helpers/profiles.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = getOptions(__ENV.PROFILE || 'A');

const businessSuccess = new Rate('business_success');

export default function () {
  // Rotate categories (1–20) and pages (1–50) to spread DB reads
  const categoryId = ((__VU + __ITER) % 20) + 1;
  const page       = (__ITER % 50) + 1;

  // Tag `name` grupuje 1000 kombinacji (kategoria x strona) w jedna serie
  // czasowa — patrz komentarz w s4_product_detail.js.
  const res = http.get(
    `${BASE_URL}/api/products?category_id=${categoryId}&page=${page}&limit=20`,
    { tags: { name: '/api/products?category_id&page' } },
  );

  const ok = check(res, {
    'status 200':  (r) => r.status === 200,
    'returns list': (r) => Array.isArray(r.json('data')),
  });
  businessSuccess.add(ok);
}
