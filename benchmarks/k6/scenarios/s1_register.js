/**
 * S1 — User registration  POST /api/users/register
 *
 * Characteristics: DB write + bcrypt hash (CPU-intensive)
 * Hypothesis: bcrypt dominates — minimal difference between implementations.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000 -e PROFILE=B \
 *     --out json=benchmarks/results/s1_B_functional.json \
 *     benchmarks/k6/scenarios/s1_register.js
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
  const email = `u_${__VU}_${__ITER}@bench.test`;

  const res = http.post(
    `${BASE_URL}/api/users/register`,
    JSON.stringify({
      name:             'Bench',
      surname:          'User',
      email,
      password:         'Password1',
      confirm_password: 'Password1',
    }),
    { headers: HEADERS },
  );

  const ok = check(res, {
    'status 201':  (r) => r.status === 201,
    'has token':   (r) => Boolean(r.json('data.token')),
  });
  businessSuccess.add(ok);
}
