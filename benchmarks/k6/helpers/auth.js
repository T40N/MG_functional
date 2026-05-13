import http from 'k6/http';
import { check } from 'k6';

const HEADERS = { 'Content-Type': 'application/json' };

/**
 * Logs in and returns the JWT token.
 * The login request is tagged { type: 'setup_login' } so it can be
 * filtered out during result analysis.
 */
export function login(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: HEADERS, tags: { type: 'setup_login' } },
  );

  check(res, { 'login 200': (r) => r.status === 200 });
  return res.json('data.token');
}

/** Login as the dedicated benchmark user. */
export function benchLogin(baseUrl) {
  return login(baseUrl, 'bench@test.com', 'Password1');
}

/** Login as seed_N@test.com — used in S5/S6 for per-VU isolation. */
export function seedLogin(baseUrl, vuId) {
  const idx = (vuId % 10000) || 10000;
  return login(baseUrl, `seed_${idx}@test.com`, 'Password1');
}

export { HEADERS };
