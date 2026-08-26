# PRD — Porównanie architektury funkcyjnej i OOP w TypeScript/Express.js

## 1. Cel projektu

Praca magisterska implementująca REST API sklepu internetowego w dwóch podejściach architektonicznych:

| | **Functional** (`apps/functional`) | **OOP** (`apps/oop`) |
|---|---|---|
| Paradygmat | Functional Core, Imperative Shell (FCIS) | Layered Architecture (Controller → Service → Repository) |
| Biblioteki | fp-ts, ReaderTaskEither | brak fp-ts, czyste async/await |
| Efekty uboczne | izolowane w Shell | wbudowane w serwisy |
| DI | typy `TEnv` (strukturalna, przez funkcje) | konstruktor klas |
| Błędy | `Either<Error, T>` / `TaskEither` | `try/catch`, rzucanie wyjątków |
| Testowanie | czyste funkcje — brak mocków | mocki konstruktorów serwisów |

Obie implementacje eksponują **identyczne API**, używają **tej samej bazy PostgreSQL** i są zestawiane benchmarkiem wydajnościowym.

---

## 2. Monorepo

```
/
├── apps/
│   ├── functional/     # port 3000
│   └── oop/            # port 3001
├── docs/
│   ├── PRD.md          # ten dokument
│   └── BENCHMARK.md    # metodologia badań wydajnościowych
├── benchmarks/
│   └── k6/             # skrypty k6 do testów obciążeniowych
├── docker-compose.yml
└── package.json        # npm workspaces
```

---

## 3. Architektura — szczegóły

### 3.1 Functional — FCIS z fp-ts

```
src/
  common/
    core/
      usecases/         ← createResponse, validate, get_messages
      types/            ← TAppEvent
    shell/
      database.ts       ← pg Pool, runner migracji
      server.ts         ← Express setup, rejestracja tras
      middleware/       ← authMiddleware (JWT)
      migrations/       ← pliki SQL (alfabetycznie)
  <feature>/            ← np. users/, categories/, products/, cart/, orders/
    core/
      usecases/         ← ReaderTaskEither<TEnv, Error, TResult> — czyste funkcje
      types/
        common/         ← TDb<Entity>, TPublic<Entity>, TEntityToSave
        create<X>/      ← TCreate<X>Input, TCreate<X>Env, TCreate<X>Result
        index.ts        ← re-eksport
    shell/
      routes/           ← Express handler (wires env + wywołuje usecase)
      db/               ← zapytania SQL (executeQueryWithPool)
      validation/       ← Zod schema + validate()
      dtos/             ← typy DTO
      factories/        ← DTO → domain input
```

**Wzorzec use case:**
```typescript
// core — czysta funkcja, zero efektów
export const createUser = (input: TCreateUserInput): RTE.ReaderTaskEither<TCreateUserEnv, Error, TCreateUserResult> =>
  pipe(
    RTE.ask<TCreateUserEnv>(),
    RTE.chainW(env => pipe(
      env.getUserByEmail(input.email),
      TE.chain(existing => existing ? TE.left(new Error('UserAlreadyExists')) : TE.right(null)),
      TE.chain(() => env.hashPassword(input.password)),
      TE.chain(hash => env.saveUser({ ...input, password: hash })),
      TE.chain(user => pipe(env.createToken({ userId: user.id, email: user.email }), TE.map(token => ({ user: toPublicUser(user), token })))),
      RTE.fromTaskEither,
    )),
  );

// shell — wstrzyknięcie env z prawdziwymi implementacjami
const env: TCreateUserEnv = {
  getUserByEmail: email => getUserByEmail(pool, email),
  hashPassword:  pw    => TE.tryCatch(() => bcrypt.hash(pw, 10), toError),
  saveUser:      user  => saveUser(pool, user),
  createToken:   data  => TE.tryCatch(() => Promise.resolve(jwt.sign(data, secret)), toError),
};
const result = await createUser(input)(env)();
```

### 3.2 OOP — Layered Architecture

```
src/
  common/
    database/
      Database.ts           ← pg Pool singleton
      BaseRepository.ts     ← abstrakcyjna klasa repozytorium
    middleware/
      authMiddleware.ts     ← weryfikacja JWT (Express middleware)
      errorHandler.ts       ← globalny handler błędów
    server/
      Server.ts             ← klasa Express app
    utils/
      ApiResponse.ts        ← helper do kształtu odpowiedzi
  <feature>/                ← np. users/, categories/, products/, cart/, orders/
    <Feature>Entity.ts      ← klasa encji domenowej
    <Feature>Repository.ts  ← dostęp do danych (extends BaseRepository)
    <Feature>Service.ts     ← logika biznesowa (konstruktor DI)
    <Feature>Controller.ts  ← obsługa HTTP (konstruktor DI)
    dtos/
      Create<Feature>Dto.ts
    validators/
      <feature>Validator.ts ← Zod schema
```

**Wzorzec serwisu:**
```typescript
// Repository — dostęp do danych
class UserRepository extends BaseRepository {
  async findByEmail(email: string): Promise<DbUser | null> { ... }
  async save(user: UserToSave): Promise<DbUser> { ... }
}

// Service — logika biznesowa
class UserService {
  constructor(
    private userRepository: UserRepository,
    private passwordService: PasswordService,
    private tokenService: TokenService,
  ) {}

  async register(dto: CreateUserDto): Promise<{ user: PublicUser; token: string }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) throw new ConflictError('UserAlreadyExists');
    const hash = await this.passwordService.hash(dto.password);
    const saved = await this.userRepository.save({ ...dto, password: hash });
    const token = this.tokenService.sign({ userId: saved.id, email: saved.email });
    return { user: toPublicUser(saved), token };
  }
}

// Controller — obsługa HTTP
class UserController {
  constructor(private userService: UserService) {}

  register = async (req: Request, res: Response) => {
    try {
      const dto = validate(createUserSchema, req.body);
      const result = await this.userService.register(dto);
      res.status(201).json(ApiResponse.success(result, 'User created'));
    } catch (err) {
      handleError(err, res);
    }
  };
}
```

---

## 4. Schemat bazy danych (współdzielony)

> **Zaktualizowano 2026-08-25.** Pierwotna wersja tej sekcji pochodziła
> z fazy 0 (commit `6936e58`, 2026-05-05) i opisywała projekt sprzed
> zmian wprowadzonych w fazie 4. Poniższe definicje odtwarzają **rzeczywisty
> stan** z `database/migrations/`, zweryfikowany względem działającej bazy.
> Wykaz różnic wobec pierwotnego projektu zamyka tę sekcję.

Obie aplikacje korzystają z **tej samej instancji PostgreSQL** i **tych samych
migracji** w `database/migrations/`, uruchamianych alfabetycznie przy starcie.
Schemat jest więc identyczny dla obu implementacji z definicji, nie z ustaleń —
co stanowi jeden z warunków równoważności porównania.

**Sześć tabel domenowych:** `users`, `categories`, `products`, `cart_items`,
`orders`, `order_items`. Siódma tabela widoczna w bazie, `migrations`, jest
techniczna — rejestruje zastosowane migracje.

```sql
-- users (001_create_users_table.sql)
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  name       TEXT NOT NULL,
  surname    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- categories (004_create_categories.sql)
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMP DEFAULT now()
);

-- products (005_create_products.sql)
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT now()
);

-- cart_items (006_create_cart_items.sql)
-- Brak osobnej encji `carts` — pozycje koszyka wiążą się z użytkownikiem
-- bezpośrednio. Rezerwacja stanu magazynowego wygasa po 15 minutach;
-- dodanie lub zmiana pozycji odnawia okno rezerwacji.
CREATE TABLE IF NOT EXISTS cart_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  reserved_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at  TIMESTAMP NOT NULL DEFAULT now() + INTERVAL '15 minutes',
  UNIQUE(user_id, product_id)
);

-- orders (007_create_orders.sql)
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'cancelled')),
  total_price NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMP DEFAULT now()
);

-- order_items (007_create_orders.sql)
CREATE TABLE IF NOT EXISTS order_items (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity          INTEGER NOT NULL,
  price_at_purchase NUMERIC(10,2) NOT NULL
);
```

### 4.1 Dostępny stan magazynowy

Stan dostępny dla danego użytkownika nie równa się `products.stock` — jest
pomniejszony o aktywne rezerwacje **innych** użytkowników:

```sql
p.stock - COALESCE(
  (SELECT SUM(ci.quantity)
     FROM cart_items ci
    WHERE ci.product_id = p.id
      AND ci.expires_at > NOW()
      AND ci.user_id != $2),
  0
) AS "availableStock"
```

Zapytanie to występuje **identycznie co do znaku** w obu implementacjach
(`apps/functional/src/cart/shell/db/getAvailableStock.ts` oraz
`apps/oop/src/cart/CartRepository.ts`).

### 4.2 Różnice wobec pierwotnego projektu z fazy 0

Zmiany wprowadzono w fazie 4 (commit `f749c3f`, 2026-05-11, „Cart with stock
reservation system"). Wprowadzenie rezerwacji czasowej uczyniło pośrednią
encję `carts` zbędną: skoro pozycja koszyka nosi własny znacznik wygaśnięcia,
a unikalność zapewnia `UNIQUE(user_id, product_id)`, dodatkowa tabela
dokładałaby złączenie przy każdym odczycie koszyka bez żadnej korzyści.

| Pierwotny projekt (faza 0) | Stan rzeczywisty | Charakter zmiany |
|---|---|---|
| tabela `carts` (1:1 z użytkownikiem) | **nie istnieje** | usunięta jako zbędna |
| `cart_items.cart_id → carts(id)` | `cart_items.user_id → users(id)` | jedno złączenie mniej na odczyt |
| `UNIQUE(cart_id, product_id)` | `UNIQUE(user_id, product_id)` | konsekwencja powyższej |
| brak rezerwacji | `reserved_at`, `expires_at` (15 min) | nowy mechanizm |
| `quantity INTEGER DEFAULT 1` | `quantity NOT NULL CHECK (quantity > 0)` | wzmocnione ograniczenie |
| `products.stock_quantity` | `products.stock` | zmiana nazwy |
| `products.name TEXT` | `VARCHAR(200)` | doprecyzowanie typu |
| `categories` bez `description` | `description TEXT` | dodana kolumna |
| `categories.name TEXT` | `VARCHAR(100)` | doprecyzowanie typu |
| `orders.total_amount` | `orders.total_price` | zmiana nazwy |
| `status`: 5 stanów w komentarzu | `CHECK IN ('pending','cancelled')` | **zawężone do 2 stanów** |
| `orders.user_id` bez `NOT NULL` | `NOT NULL` | wzmocnione ograniczenie |
| brak `ON DELETE` na kluczach obcych | `SET NULL` / `CASCADE` | doprecyzowanie |

**Uwaga do rozdziału 4 pracy:** zawężenie statusów zamówienia do `pending`
i `cancelled` jest istotne przy opisie zakresu funkcjonalnego — pierwotnie
planowany cykl życia zamówienia (`confirmed`, `shipped`, `delivered`) nie
został zaimplementowany, ponieważ nie wnosiłby nic do pomiaru wydajności.

---

## 5. API — specyfikacja endpointów

Obie aplikacje implementują dokładnie ten sam kontrakt HTTP:

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| POST | `/api/users/register` | nie | Rejestracja użytkownika |
| POST | `/api/auth/login` | nie | Logowanie, zwraca JWT |
| GET | `/api/categories` | nie | Lista kategorii |
| POST | `/api/categories` | TAK | Utwórz kategorię |
| GET | `/api/products` | nie | Lista produktów (query: `category_id`, `search`, `page`, `limit`) |
| GET | `/api/products/:id` | nie | Szczegóły produktu |
| POST | `/api/products` | TAK | Utwórz produkt |
| GET | `/api/cart` | TAK | Koszyk zalogowanego użytkownika |
| POST | `/api/cart/items` | TAK | Dodaj produkt do koszyka |
| PUT | `/api/cart/items/:productId` | TAK | Zmień ilość produktu |
| DELETE | `/api/cart/items/:productId` | TAK | Usuń pozycję z koszyka |
| DELETE | `/api/cart` | TAK | Wyczyść koszyk |
| POST | `/api/orders` | TAK | Złóż zamówienie |
| GET | `/api/orders` | TAK | Historia zamówień użytkownika |
| GET | `/api/orders/:id` | TAK | Szczegóły zamówienia |
| PATCH | `/api/orders/:id/cancel` | TAK | Anuluj zamówienie |

**Kształt odpowiedzi (identyczny w obu implementacjach):**
```json
// sukces
{ "success": true, "data": { ... }, "message": "..." }

// błąd
{ "success": false, "error": { "type": "...", "details": null }, "message": "..." }
```

---

## 6. Plan implementacji — fazy

Każda faza = implementacja **w obu aplikacjach równolegle**, po zakończeniu fazy → testy + benchmark porównawczy.

### Faza 0 — Naprawa bugów
**Functional:**
- [ ] Migracja `003_drop_client_number.sql` — usuwa kolumnę `client_number`
- [ ] Dodać `createToken` do `TLoginEnv` i `TLoginResult` — login zwraca JWT
- [ ] Usunąć martwy kod: `TCreateUserEffect.ts`, `eventBus.ts`
- [ ] Zaktualizować `TDbUser` — usunąć `client_number`

**OOP:**
- [ ] Zainicjować `apps/oop/` — package.json, tsconfig, jest.config
- [ ] Zaimplementować `Database.ts`, `Server.ts`, `BaseRepository.ts`
- [ ] Zaimplementować `UserRepository`, `UserService`, `UserController`
- [ ] POST `/api/users/register` + POST `/api/auth/login` z tokenem

**TDD (oba):** unit testy use case/serwisu → testy integracyjne routów → wszystkie zielone

### Faza 1 — Middleware JWT
**Functional:**
- [ ] `src/common/shell/middleware/authMiddleware.ts`
- [ ] Rozszerzenie typu `Request` o `userId`

**OOP:**
- [ ] `src/common/middleware/authMiddleware.ts`
- [ ] Rozszerzenie typu `Request` o `userId`

**TDD (oba):** test 401 bez tokenu, test 200 z tokenem

### Faza 2 — Kategorie
**Functional:** usecase `createCategory` + `getCategories` + route + db + walidacja
**OOP:** `CategoryRepository` + `CategoryService` + `CategoryController`
**TDD:** unit → integracyjne

### Faza 3 — Produkty
**Functional:** usecase `createProduct` + `getProducts` (z filtrowaniem) + `getProductById`
**OOP:** `ProductRepository` + `ProductService` + `ProductController`
**TDD:** unit → integracyjne; test filtrowania (category_id, search, page)

### Faza 4 — Koszyk
**Functional:** usecases: `getOrCreateCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `clearCart`
**OOP:** `CartRepository` + `CartItemRepository` + `CartService` + `CartController`
**TDD:** unit → integracyjne; test walidacji stocku

### Faza 5 — Zamówienia (główna logika)
**Functional:** use case `placeOrder` (RTE chain — atomowa transakcja):
```
getCart → validateNotEmpty → checkStock(each) → calcTotal
→ beginTransaction → createOrder → createOrderItems(price_at_purchase)
→ decrementStock(each) → clearCart → commitTransaction
```
**OOP:** `OrderService.placeOrder` (async/await + try/catch + pg transaction):
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... ta sama logika krokami
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}
```
**TDD:** unit testy każdego kroku logiki + integracyjne e2e (pełny przepływ: register → login → add products → place order)

---

## 7. Kluczowe decyzje architektoniczne

| Decyzja | Powód |
|---------|-------|
| `price_at_purchase` w `order_items` | Zmiana ceny produktu nie może wpływać na historyczne zamówienia |
| Koszyk 1:1 z userem | Jeden aktywny koszyk, tworzony przy pierwszym dodaniu produktu |
| `placeOrder` atomowe | Błąd na dowolnym etapie cofa całą transakcję |
| Status zamówienia: `pending → confirmed → shipped → delivered` lub `cancelled` | Standard e-commerce flow |
| Obie apki na tym samym DB | Warunki benchmarku muszą być identyczne |
| Porty: functional=3000, oop=3001 | Równoległa praca i benchmark bez restartów |

---

## 8. Definition of Done — per faza

- [ ] Wszystkie testy jednostkowe przechodzą (obie apki)
- [ ] Wszystkie testy integracyjne routów przechodzą (obie apki)
- [ ] Endpoint dostępny na obu portach i zwraca identyczny kształt odpowiedzi
- [ ] Benchmark uruchomiony i wyniki zapisane w `benchmarks/results/`
- [ ] Kod przechodzi linting (`npm run lint`)
