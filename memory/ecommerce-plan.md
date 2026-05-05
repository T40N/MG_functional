# Plan rozbudowy — Sklep internetowy (e-commerce)

## Kontekst
Aplikacja jest częścią pracy magisterskiej porównującej podejście funkcyjne (fp-ts) z OOP.
Repo: monorepo — `apps/functional/` (port 3000), `apps/oop/` (port 3001).
Domena: **sklep internetowy**.

---

## Schemat bazy danych (docelowy)

```sql
-- categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT now()
);

-- carts (1:1 z user)
CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

-- cart_items
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(cart_id, product_id)
);

-- orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | shipped | delivered | cancelled
  total_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- order_items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price_at_purchase NUMERIC(10,2) NOT NULL
);
```

---

## Endpointy API

| Metoda | Ścieżka | Auth JWT | Opis |
|--------|---------|----------|------|
| GET | `/` | nie | Healthcheck ✅ oba apps |
| POST | `/api/users/register` | nie | Rejestracja ✅ |
| POST | `/api/auth/login` | nie | Login ✅ (zwraca token) |
| GET | `/api/me` | TAK | Weryfikacja JWT ✅ |
| GET | `/api/categories` | nie | Lista kategorii |
| POST | `/api/categories` | TAK | Dodaj kategorię (chroniony) |
| GET | `/api/products` | nie | Lista produktów (filtr: category_id, search, page, limit) |
| GET | `/api/products/:id` | nie | Szczegóły produktu |
| GET | `/api/cart` | TAK | Koszyk zalogowanego użytkownika |
| POST | `/api/cart/items` | TAK | Dodaj produkt do koszyka |
| PUT | `/api/cart/items/:productId` | TAK | Zmień ilość produktu w koszyku |
| DELETE | `/api/cart/items/:productId` | TAK | Usuń produkt z koszyka |
| DELETE | `/api/cart` | TAK | Wyczyść koszyk |
| POST | `/api/orders` | TAK | Złóż zamówienie |
| GET | `/api/orders` | TAK | Historia zamówień użytkownika |
| GET | `/api/orders/:id` | TAK | Szczegóły zamówienia |
| PATCH | `/api/orders/:id/cancel` | TAK | Anuluj zamówienie |

---

## Kolejność implementacji

### ✅ FAZA 0 — Naprawa bugów
- ✅ Migracja 003 — DROP COLUMN client_number CASCADE
- ✅ Login zwraca JWT token (createToken w TLoginEnv + TLoginResult)
- ✅ Usunięty martwy kod: TCreateUserEffect.ts, eventBus.ts, stare migracje w apps/

### ✅ FAZA 1 — Middleware JWT (oba apps)
- ✅ `authMiddleware.ts` w functional i OOP
- ✅ GET /api/me — chroniony endpoint testowy
- ✅ Rozszerzenie Express Request o `userId`

### ✅ OOP bootstrap
- ✅ UserRepository, UserService, UserController
- ✅ GET / healthcheck route (potrzebny do Docker healthcheck)
- ✅ Docker: mg_functional (3000) + mg_oop (3001) — oba healthy

### FAZA 2 — Kategorie (NASTĘPNA)
Implementować TDD: najpierw testy (Red), potem kod (Green), w obu apps jednocześnie.

**Functional** (`apps/functional/src/categories/`):
- migration: `database/migrations/004_create_categories.sql`
- `core/types/`: TDbCategory, TGetCategoriesTypes, TCreateCategoryTypes, index.ts
- `core/usecases/`: getCategories.ts, createCategory.ts
- `shell/db/`: getAllCategories.ts, getCategoryByName.ts, saveCategory.ts
- `shell/routes/`: getCategories.ts, createCategory.ts (z authMiddleware)
- `shell/validation/`: createCategoryValidation.ts
- Dodać alias `@categories/*` do tsconfig.json i jest.config.js
- Zarejestrować routes w server.ts

**OOP** (`apps/oop/src/categories/`):
- CategoryTypes.ts, CategoryRepository.ts, CategoryService.ts, CategoryController.ts
- validators/categoryValidators.ts
- Dodać alias `@categories/*` do tsconfig.json i jest.config.js
- Zarejestrować CategoryController w app.ts

**Tests**:
- Functional: `__tests__/categories/getCategories.usecase.test.ts`, `createCategory.usecase.test.ts`, `getCategories.test.ts`, `createCategory.test.ts`
- OOP: `__tests__/categories/categoryService.test.ts`, `categories.route.test.ts`

**HTTP file**: `requests/categories.http` ([F] i [O])

### FAZA 3 — Produkty
- Migration: `005_create_products.sql`
- `src/products/` w obu apps
- GET /api/products (filtrowanie: category_id, search, page, limit)
- GET /api/products/:id
- POST /api/products (chroniony — opcjonalnie)

### FAZA 4 — Koszyk
- Migrations: `006_create_carts.sql`, `007_create_cart_items.sql`
- `src/cart/` w obu apps
- Pełne CRUD koszykowe

### FAZA 5 — Zamówienia (główna logika)
- Migrations: `008_create_orders.sql`, `009_create_order_items.sql`
- `src/orders/` w obu apps
- **`placeOrder` use case** — atomowe, w transakcji PostgreSQL:
  `getCart → walidacja → sprawdź stock → oblicz total → utwórz order + items → zmniejsz stock → wyczyść koszyk`

---

## Ważne decyzje architektoniczne

- **`price_at_purchase`** — cena zapamiętana w momencie zakupu
- **Koszyk 1:1 z userem** — tworzony przy pierwszym dodaniu produktu
- **`placeOrder` jest atomowe** — błąd cofa całą operację; DB: jedna transakcja PostgreSQL
- **Status zamówienia**: `pending → confirmed → shipped → delivered` lub `pending → cancelled`
- **API response shape**: `{ success: true, data: T, message: string }` / `{ success: false, error: { type, details }, message: string }`
- **TDD workflow**: Red (testy w obu apps) → Green (implementacja) → lint → commit → .http file → podsumowanie fazy

---

## Stan na koniec sesji 2026-05-05

- ✅ Monorepo skonfigurowane, oba apps w Docker (healthy)
- ✅ Faza 0 + 1 + OOP bootstrap ukończone, wszystkie testy przechodzą
- ✅ Shared migrations w `database/migrations/` (z tracking table)
- ✅ `requests/`: health.http, users.http, me.http
- ❌ Fazy 2-5 niezaczęte
