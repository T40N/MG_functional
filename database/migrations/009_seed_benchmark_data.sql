-- Benchmark seed data
-- Inserts a large, realistic dataset for performance testing.
-- Runs once (tracked by migration runner). Safe to re-deploy on existing volumes.
--
-- Final counts:
--   20        categories
--   10 001    users  (bench@test.com + 10 000 seed users, password: Password1)
--   100 000   products  (spread across categories, varied price/stock)
--   200 000   orders    (20 per seed user, mixed statuses)
--   600 000   order_items (3 per order, pseudo-random product distribution)

-- ---------------------------------------------------------------
-- 1. Categories
-- ---------------------------------------------------------------
INSERT INTO categories (name, description)
VALUES
  ('Elektronika',        'Urządzenia elektroniczne i akcesoria'),
  ('Odzież damska',      'Odzież i dodatki dla kobiet'),
  ('Odzież męska',       'Odzież i dodatki dla mężczyzn'),
  ('Buty',               'Obuwie sportowe i codzienne'),
  ('Dom i ogród',        'Artykuły domowe i ogrodnicze'),
  ('Sport i fitness',    'Sprzęt sportowy i odzież sportowa'),
  ('Książki',            'Literatura, podręczniki i e-booki'),
  ('Zabawki',            'Zabawki i gry dla dzieci'),
  ('Zdrowie i uroda',    'Kosmetyki, suplementy i pielęgnacja'),
  ('Motoryzacja',        'Akcesoria i części samochodowe'),
  ('RTV i AGD',          'Sprzęt rtv i agd'),
  ('Komputery',          'Komputery, laptopy i peryferia'),
  ('Telefony',           'Smartfony i akcesoria'),
  ('Żywność',            'Produkty spożywcze i napoje'),
  ('Biuro',              'Artykuły biurowe i szkolne'),
  ('Fotografia',         'Aparaty, obiektywy i akcesoria'),
  ('Muzyka',             'Instrumenty i akcesoria muzyczne'),
  ('Filmy i gry',        'Filmy, seriale i gry wideo'),
  ('Biżuteria',          'Biżuteria i zegarki'),
  ('Podróże',            'Walizki, plecaki i akcesoria podróżne')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Benchmark user  (password: Password1, bcrypt cost=10)
-- ---------------------------------------------------------------
INSERT INTO users (email, password, name, surname)
VALUES (
  'bench@test.com',
  '$2b$10$t4hnF5LCEV01Na4BWm7eiu3TikvrXfTV86VBLMhr9suGWtHiSoUzW',
  'Bench',
  'User'
)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Seed users 1–10 000  (password: Password1, same hash)
-- ---------------------------------------------------------------
INSERT INTO users (email, password, name, surname)
SELECT
  'seed_' || i || '@test.com',
  '$2b$10$t4hnF5LCEV01Na4BWm7eiu3TikvrXfTV86VBLMhr9suGWtHiSoUzW',
  'Imię'     || i,
  'Nazwisko' || i
FROM generate_series(1, 10000) AS i
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Products  100 000
--    Price:  10–1000 PLN  (deterministic, varied by product id)
--    Stock:  1–500        (deterministic)
--    5 low-stock products per category (stock 1–10) for race-condition tests
-- ---------------------------------------------------------------
WITH cat_ids AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
  FROM categories
)
INSERT INTO products (name, description, price, stock, category_id)
SELECT
  'Produkt ' || s.i,
  'Opis produktu ' || s.i,
  ROUND((((s.i * 7919) % 990) + 10)::numeric, 2)   AS price,
  ((s.i * 1009) % 500)::int + 1                     AS stock,
  c.id                                               AS category_id
FROM generate_series(1, 100000) AS s(i)
JOIN cat_ids c ON c.rn = (s.i - 1) % 20;

-- Low-stock products (stock 1–10) — triggers race conditions in S5/S6
INSERT INTO products (name, description, price, stock, category_id)
SELECT
  'Limitowany ' || s.i,
  'Produkt limitowany, mała dostępność',
  ROUND((((s.i * 6131) % 4900) + 100)::numeric, 2),
  (s.i % 10) + 1,
  c.id
FROM generate_series(1, 100) AS s(i)
JOIN (SELECT id, (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn FROM categories) c
  ON c.rn = (s.i - 1) % 20;

-- ---------------------------------------------------------------
-- 5. Orders  200 000  (20 per seed user)
--    70% pending / 30% cancelled
--    Date spread: last 365 days
-- ---------------------------------------------------------------
INSERT INTO orders (user_id, status, total_price, created_at)
SELECT
  u.id,
  CASE (u.id * n % 10)
    WHEN 0 THEN 'cancelled'
    WHEN 1 THEN 'cancelled'
    WHEN 2 THEN 'cancelled'
    ELSE 'pending'
  END,
  ROUND((((u.id * n * 7919) % 900) + 100)::numeric, 2),
  NOW() - ((u.id + n * 17) % 365)::int * INTERVAL '1 day'
FROM users u
CROSS JOIN generate_series(1, 20) AS n
WHERE u.email LIKE 'seed_%@test.com';

-- ---------------------------------------------------------------
-- 6. Order items  600 000  (3 per order)
--    Product distribution: deterministic pseudo-random via primes
-- ---------------------------------------------------------------
WITH prod_bounds AS (
  SELECT MIN(id) AS min_id, COUNT(*) AS cnt FROM products
)
INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
SELECT
  o.id,
  (pb.min_id + (o.id * 7919 + n * 104729) % pb.cnt)::int,
  (o.id % 5 + 1)::int,
  ROUND((((o.id * n * 3571) % 990) + 10)::numeric, 2)
FROM orders o
CROSS JOIN generate_series(1, 3) AS n
CROSS JOIN prod_bounds pb
WHERE o.user_id IN (SELECT id FROM users WHERE email LIKE 'seed_%@test.com');
