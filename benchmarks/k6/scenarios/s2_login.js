/**
 * S2 — Login  POST /api/auth/login
 *
 * Characteristics: DB read + bcrypt compare + JWT sign
 * Hypothesis: bcrypt compare dominates — minimal difference between implementations.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s2_B_functional.json \
 *     benchmarks/k6/scenarios/s2_login.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { getOptions } from '../helpers/profiles.js';
import { HEADERS } from '../helpers/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = getOptions(__ENV.PROFILE || 'A');

const businessSuccess = new Rate('business_success');

export default function () {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email:    'bench@test.com',
      password: 'Password1',
    }),
    { headers: HEADERS },
  );

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has token':  (r) => Boolean(r.json('data.token')),
  });
  businessSuccess.add(ok);
}
