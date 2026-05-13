/**
 * Benchmark reset script — run before each benchmark scenario.
 *
 * Cleans transient state left by previous test runs while keeping the large
 * seed dataset intact (seed users, products, historical orders from migration 009).
 *
 * Usage (from monorepo root):
 *   npm run bench:reset
 *
 * What it does:
 *   1. Deletes all cart_items
 *   2. Deletes orders placed by non-seed users (S6 test runs)
 *   3. Deletes users registered during S1 test runs
 *   4. Restores product stock to original values
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

function loadEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// Load .env when running locally (skipped in Docker where env is injected)
loadEnv(path.resolve(process.cwd(), 'apps/functional/.env'));

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME     ?? 'postgres',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
});

async function reset(): Promise<void> {
  const start = Date.now();
  console.log('Resetting benchmark state...\n');

  // 1. Clear all cart items (transient, left by S5 runs)
  const { rowCount: cartRows } = await pool.query('DELETE FROM cart_items');
  console.log(`  cart_items cleared:        ${cartRows ?? 0}`);

  // 2. Remove orders placed by non-seed users (bench user + S6 test runs)
  //    Seed orders (from migration 009) are kept for realistic data volume.
  const { rowCount: orderRows } = await pool.query(`
    DELETE FROM orders
    WHERE user_id NOT IN (
      SELECT id FROM users
      WHERE email LIKE 'seed_%@test.com'
         OR email = 'bench@test.com'
    )
  `);
  console.log(`  test-run orders removed:   ${orderRows ?? 0}`);

  // 3. Remove users registered during S1 runs (k6 pattern: user_N_M@test.com)
  const { rowCount: userRows } = await pool.query(`
    DELETE FROM users
    WHERE email NOT LIKE 'seed_%@test.com'
      AND email != 'bench@test.com'
  `);
  console.log(`  test-run users removed:    ${userRows ?? 0}`);

  // 4. Restore regular product stocks using original migration formula
  //    Formula: ((id * 1009) % 500) + 1  — deterministic, matches migration 009
  const { rowCount: regularRows } = await pool.query(`
    UPDATE products
    SET stock = ((id * 1009) % 500)::int + 1
    WHERE name LIKE 'Produkt %'
  `);
  console.log(`  regular stocks restored:   ${regularRows ?? 0}`);

  // 5. Restore limited product stocks (stock 1–10, for race condition tests)
  const { rowCount: limitedRows } = await pool.query(`
    UPDATE products p
    SET stock = (sub.rn % 10)::int + 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
      FROM products
      WHERE name LIKE 'Limitowany %'
    ) sub
    WHERE p.id = sub.id
  `);
  console.log(`  limited stocks restored:   ${limitedRows ?? 0}`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\nDone in ${elapsed}s`);
}

reset()
  .catch((err) => {
    console.error('Reset failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
