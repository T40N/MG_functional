# Plan rozbudowy — Sklep internetowy (e-commerce)

## Kontekst
Aplikacja jest częścią pracy magisterskiej porównującej podejście funkcyjne (fp-ts) z OOP.
Repo: monorepo, projekt funkcyjny w `apps/functional/`.
Domena: **sklep internetowy**.

---

## Schemat bazy danych (docelowy)

```sql
-- UWAGA: usunąć client_number z users (nie pasuje do e-commerce)
-- Migracja 003 powinna DROP COLUMN client_number

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
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
  price_at_purchase NUMERIC(10,2) NOT NULL  -- cena utrwalona w momencie zakupu
);
```

---

## Endpointy API

| Metoda | Ścieżka | Auth JWT | Opis |
|--------|---------|----------|------|
| POST | `/api/users/register` | nie | Rejestracja ✅ działa |
| POST | `/api/auth/login` | nie | Login ✅ działa (do naprawy: brak tokenu) |
| GET | `/api/categories` | nie | Lista kategorii |
| GET | `/api/products` | nie | Lista produktów (filtr: category_id, search, page, limit) |
| GET | `/api/products/:id` | nie | Szczegóły produktu |
| GET | `/api/cart` | TAK | Koszyk zalogowanego użytkownika |
| POST | `/api/cart/items` | TAK | Dodaj produkt do koszyka |
| PUT | `/api/cart/items/:productId` | TAK | Zmień ilość produktu w koszyku |
| DELETE | `/api/cart/items/:productId` | TAK | Usuń produkt z koszyka |
| DELETE | `/api/cart` | TAK | Wyczyść koszyk |
| POST | `/api/orders` | TAK | **Złóż zamówienie** (główna logika biznesowa) |
| GET | `/api/orders` | TAK | Historia zamówień użytkownika |
| GET | `/api/orders/:id` | TAK | Szczegóły zamówienia |
| PATCH | `/api/orders/:id/cancel` | TAK | Anuluj zamówienie (przywraca stany) |

---

## Kolejność implementacji

### FAZA 0 — Naprawa bugów (zrobić PIERWSZE)
- [ ] Odkomentować/naprawić migrację `002_client_number_seq.sql` LUB napisać migrację `003` usuwającą `client_number` z tabeli users i zmieniającą schemat
- [ ] Dodać zwrot JWT tokenu w `loginUser` — dodać `createToken` do `TLoginEnv` i `TLoginResult`
- [ ] Usunąć martwy kod: `TCreateUserEffect.ts`, oczyścić `eventBus.ts`

### FAZA 1 — Middleware JWT
- [ ] `src/common/shell/middleware/authMiddleware.ts` — weryfikacja tokenu z nagłówka `Authorization: Bearer <token>`
- [ ] Wyciągnąć `userId` z tokenu i dołączyć do `req` (rozszerzenie typu Express Request)
- [ ] Testy: chroniony endpoint bez tokenu → 401, z tokenem → działa

### FAZA 2 — Kategorie
- [ ] Migracja SQL: tabela `categories`
- [ ] `src/categories/` — analogiczna struktura do `src/users/` (core/shell)
- [ ] GET `/api/categories` — lista (publiczny)
- [ ] (opcjonalnie) POST `/api/categories` — tworzenie (chroniony)

### FAZA 3 — Produkty
- [ ] Migracja SQL: tabela `products`
- [ ] `src/products/` — core/shell
- [ ] GET `/api/products` — lista z filtrowaniem (category_id, search, page, limit)
- [ ] GET `/api/products/:id` — szczegóły
- [ ] (opcjonalnie) POST/PUT `/api/products` — CRUD (chroniony)

### FAZA 4 — Koszyk
- [ ] Migracja SQL: tabele `carts` + `cart_items`
- [ ] `src/cart/` — core/shell
- [ ] GET `/api/cart` — pobierz koszyk (tworzy jeśli nie istnieje)
- [ ] POST `/api/cart/items` — dodaj (walidacja: produkt istnieje, stock > 0)
- [ ] PUT `/api/cart/items/:productId` — zmień ilość (walidacja: stock)
- [ ] DELETE `/api/cart/items/:productId` — usuń pozycję
- [ ] DELETE `/api/cart` — wyczyść koszyk

### FAZA 5 — Zamówienia (główna logika)
- [ ] Migracja SQL: tabele `orders` + `order_items`
- [ ] `src/orders/` — core/shell
- [ ] **`placeOrder` use case** — kluczowa logika:
  ```
  getCart → walidacja (niepusty) → sprawdź stock każdego produktu
  → oblicz total → utwórz order → utwórz order_items (z price_at_purchase)
  → zmniejsz stock → wyczyść koszyk
  ```
- [ ] GET `/api/orders` — historia
- [ ] GET `/api/orders/:id` — szczegóły
- [ ] PATCH `/api/orders/:id/cancel` — anulowanie (przywraca stock, zmienia status)

---

## Struktura modułów (wzorzec do stosowania)

Każda nowa funkcjonalność powinna mieć strukturę analogiczną do `src/users/`:

```
src/<feature>/
  core/
    usecases/       ← czyste funkcje ReaderTaskEither
    types/
      index.ts      ← re-export wszystkich typów
      common/       ← TDb<Entity>, TPublic<Entity>, TEntityToSave
      create<Entity>/  ← TCreate<Entity>Input, TCreate<Entity>Env, TCreate<Entity>Result
  shell/
    routes/         ← Express handler + rejestracja
    db/             ← zapytania SQL (executeQueryWithPool)
    validation/     ← Zod schema + validate()
    dtos/           ← typy DTO (deklaracje)
    factories/      ← DTO → domain input
```

---

## Ważne decyzje architektoniczne

- **`price_at_purchase`** w `order_items` — cena musi być zapamiętana z momentu zakupu, zmiana ceny produktu nie może wpływać na historyczne zamówienia
- **Koszyk 1:1 z userem** — jeden aktywny koszyk per user, tworzony przy pierwszym dodaniu produktu
- **`placeOrder` jest atomowe** — jeśli cokolwiek się nie powiedzie (np. brak stocku dla jednego produktu), cała operacja cofa się. W FP: `TaskEither` chain — błąd na dowolnym etapie przerywa resztę. DB: wszystko w jednej transakcji PostgreSQL.
- **Status zamówienia**: `pending → confirmed → shipped → delivered` lub `pending → cancelled`

---

## Stan na koniec tej sesji

- ✅ Monorepo skonfigurowane (`apps/functional/`, `apps/oop/` placeholder)
- ✅ npm workspaces działa, wszystkie testy przechodzą (25/25)
- ✅ Plan e-commerce zapisany
- ❌ Bugi jeszcze nienaprawione (faza 0)
- ❌ Nowe funkcjonalności niezaczęte
