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
 *   0. Verifies it is connected to the benchmark database (refuses otherwise)
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

const DB_CONFIG = {
  host:     process.env.DB_HOST     ?? 'localhost',
  // 55432 to port hosta benchmarkowego PostgreSQL (patrz docker-compose.yml).
  // Port 5432 na hoście może należeć do zupełnie innego projektu — a ten skrypt
  // wykonuje DELETE, więc domyślna wartość NIE MOŻE wskazywać na 5432.
  port:     parseInt(process.env.DB_PORT ?? '55432', 10),
  database: process.env.DB_NAME     ?? 'postgres',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
};

const pool = new Pool(DB_CONFIG);

/**
 * Liczba zamowien tworzonych przez migracje 009_seed_benchmark_data.sql
 * (20 zamowien x 10 000 uzytkownikow seedowych). Zamowienia maja kolejne
 * identyfikatory od 1, wiec granica id sluzy do odroznienia stanu seedowego
 * od osadu pozostawionego przez przebiegi S6.
 *
 * Zmiana w migracji 009 WYMAGA aktualizacji tej stalej.
 */
const SEED_ORDER_COUNT = 200_000;

/**
 * Tabele, które musi zawierać baza benchmarku.
 * Lista odzwierciedla rzeczywisty schemat z database/migrations/ — koszyk nie ma
 * osobnej encji `carts`, pozycje koszyka wiążą się bezpośrednio z użytkownikiem.
 */
const REQUIRED_TABLES = [
  'users', 'categories', 'products', 'cart_items', 'orders', 'order_items',
];

/**
 * Zabezpieczenie przed czyszczeniem niewłaściwej bazy.
 *
 * Skrypt wykonuje DELETE na users/orders/cart_items. Jeśli DB_HOST/DB_PORT/DB_NAME
 * wskażą przypadkiem inną instancję PostgreSQL (co jest realne, gdy na maszynie
 * działa kilka projektów), operacja nie może się rozpocząć. Wymagamy obecności
 * pełnego schematu benchmarku — inaczej odmawiamy i wychodzimy z błędem.
 */
async function assertBenchmarkDatabase(): Promise<void> {
  const target = `${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`;
  console.log(`  target: ${target}`);

  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES],
  );

  const found = new Set(rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !found.has(t));

  if (missing.length > 0) {
    throw new Error(
      `odmowa czyszczenia — to nie wygląda na bazę benchmarku.\n` +
      `  Połączenie:       ${target}\n` +
      `  Brakujące tabele: ${missing.join(', ')}\n` +
      `  Skrypt wykonuje DELETE na users/orders/cart_items i nie zgadnie, czy trafił\n` +
      `  we właściwą instancję. Sprawdź DB_HOST / DB_PORT / DB_NAME oraz to, czy\n` +
      `  środowisko benchmarku jest uruchomione (docker compose up -d).`,
    );
  }
}

async function reset(): Promise<void> {
  const start = Date.now();
  console.log('Resetting benchmark state...\n');

  await assertBenchmarkDatabase();

  // 1. Clear all cart items (transient, left by S5 runs)
  //    TRUNCATE zamiast DELETE: DELETE zostawia martwe krotki i rozdete strony
  //    indeksowe, wiec tabela o zerowej liczbie wierszy potrafila zajmowac
  //    kilkanascie megabajtow i spowalniac podzapytanie o dostepny stan
  //    magazynowy. TRUNCATE zwalnia strony natychmiast i daje identyczny
  //    punkt startowy dla obu implementacji.
  await pool.query('TRUNCATE TABLE cart_items RESTART IDENTITY');
  console.log('  cart_items:                TRUNCATE (strony zwolnione)');

  // 2. Remove orders created by benchmark runs.
  //
  //    UWAGA — poprzedni predykat byl blędny i sprzeczny z wlasnym komentarzem:
  //    usuwal zamowienia uzytkownikow NIE-seedowych, podczas gdy s6_place_order.js
  //    sklada zamowienia wlasnie JAKO uzytkownicy seedowi ("Each VU uses its own
  //    seed user for cart isolation"). Zamowienia benchmarkowe nigdy nie byly
  //    wiec czyszczone: tabela urosla z 200 tys. do 7,8 mln wierszy, a poniewaz
  //    run_single.sh mierzyl zawsze functional przed OOP, kazda faza OOP
  //    pracowala na tabeli powiekszonej o swiezy przebieg konkurenta.
  //
  //    Migracja 009 tworzy DOKLADNIE SEED_ORDER_COUNT zamowien o kolejnych
  //    identyfikatorach, wiec wszystko powyzej tej granicy jest osadem
  //    benchmarkowym. order_items znikaja kaskada (ON DELETE CASCADE).
  const { rowCount: orderRows } = await pool.query(
    'DELETE FROM orders WHERE id > $1',
    [SEED_ORDER_COUNT],
  );
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
