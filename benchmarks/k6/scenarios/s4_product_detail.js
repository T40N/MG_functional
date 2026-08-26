/**
 * S4 — Product detail  GET /api/products/:id
 *
 * Characteristics: single-row PK lookup — fastest possible DB operation.
 * Hypothesis: best chance to reveal fp-ts overhead (operation so fast that
 *             architectural overhead is proportionally larger).
 * Product IDs rotated via coprime multipliers to avoid hot-page caching.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s4_B_functional.json \
 *     benchmarks/k6/scenarios/s4_product_detail.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { getOptions } from '../helpers/profiles.js';

const BASE_URL       = __ENV.BASE_URL  || 'http://localhost:3000';
const PRODUCT_COUNT  = 100000;

export const options = getOptions(__ENV.PROFILE || 'A');

const businessSuccess = new Rate('business_success');

export default function () {
  // Pseudo-random spread across 100k products; coprime multipliers ensure
  // full coverage before repeating
  const productId = ((__VU * 7919 + __ITER * 1009) % PRODUCT_COUNT) + 1;

  // Tag `name` grupuje wszystkie warianty URL-a w JEDNA serie czasowa.
  // Bez niego k6 traktuje kazdy z 100 000 identyfikatorow jako osobna metryke:
  // przy profilu D dawalo to ponad 800 tys. serii czasowych, ostrzezenie
  // "high-cardinality values", pliki wynikowe rzedu 20 GB na przebieg
  // i realne obciazenie samego generatora, ktory konkuruje o zasoby
  // z mierzonymi aplikacjami.
  const res = http.get(`${BASE_URL}/api/products/${productId}`, {
    tags: { name: '/api/products/:id' },
  });

  const ok = check(res, {
    'status 200':   (r) => r.status === 200,
    'has product':  (r) => Boolean(r.json('data.id')),
  });
  businessSuccess.add(ok);
}
