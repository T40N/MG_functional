# Praca magisterska — Functional vs OOP w TypeScript/Express.js

Monorepo zawierające dwie implementacje tego samego REST API e-commerce: funkcyjną (`fp-ts`, FCIS) oraz obiektową (warstwy Controller–Service–Repository). Celem projektu jest empiryczne porównanie wydajności i charakterystyki zasobów obu podejść za pomocą benchmarków k6.

---

## Spis treści

1. [Struktura projektu](#struktura-projektu)
2. [Architektura — implementacja funkcyjna](#architektura--implementacja-funkcyjna)
3. [Architektura — implementacja OOP](#architektura--implementacja-oop)
4. [Schemat bazy danych](#schemat-bazy-danych)
5. [API — endpointy](#api--endpointy)
6. [Uruchamianie aplikacji](#uruchamianie-aplikacji)
7. [Testy](#testy)
8. [Benchmark](#benchmark)
9. [Analiza wyników](#analiza-wyników)
10. [Pytania badawcze i hipotezy](#pytania-badawcze-i-hipotezy)

---

## Struktura projektu

```
.
├── apps/
│   ├── functional/          # Implementacja funkcyjna (port 3000)
│   └── oop/                 # Implementacja OOP (port 3001)
├── benchmarks/
│   ├── k6/
│   │   ├── scenarios/       # Skrypty k6: S1–S6
│   │   └── helpers/         # auth.js, profiles.js
│   ├── analysis/
│   │   ├── compare.py       # Skrypt analizy i wykresów
│   │   └── charts/          # Wygenerowane wykresy PNG
│   ├── results/             # Surowe wyniki (JSONL, CSV)
│   ├── seed/reset.ts        # Reset bazy przed każdym testem
│   ├── run_single.sh        # Uruchomienie jednego scenariusza
│   └── run_all.sh           # Pełna orkiestracja S1–S6 × A–D
├── database/
│   └── migrations/          # Migracje SQL (uruchamiane przy starcie)
├── docs/
│   ├── PRD.md               # Specyfikacja produktu
│   └── BENCHMARK.md         # Metodologia benchmarku
├── requests/                # Pliki .http do testowania API ręcznie
├── docker-compose.yml
└── package.json             # Monorepo (npm workspaces)
```

Obie aplikacje współdzielą tę samą bazę PostgreSQL i identyczny schemat — różnią się wyłącznie architekturą kodu Node.js.

---

## Architektura — implementacja funkcyjna

**Wzorzec:** Functional Core, Imperative Shell (FCIS) z biblioteką `fp-ts`.

### Zasada podziału

| Warstwa | Katalog | Opis |
|---------|---------|------|
| **Core** | `src/<feature>/core/` | Czyste funkcje bez efektów ubocznych. Zero importów z bazy, bcrypt, JWT. |
| **Shell** | `src/<feature>/shell/` | Efekty uboczne: Express routes, zapytania SQL, bcrypt, JWT. |

### Typ use case — `ReaderTaskEither`

Każdy use case to funkcja `TInput → ReaderTaskEither<TEnv, Error, TResult>`:

```typescript
// apps/functional/src/users/core/usecases/createUser.ts
export const createUser = (input: TCreateUserInput):
  RTE.ReaderTaskEither<TCreateUserEnv, Error, TCreateUserResult> =>
  pipe(
    RTE.ask<TCreateUserEnv>(),
    RTE.chainW((env) =>
      pipe(
        env.getUserByEmail(input.email),
        TE.chain((existing) =>
          existing ? TE.left(new Error('UserAlreadyExists')) : TE.right(null)
        ),
        TE.chain(() => env.hashPassword(input.password)),
        TE.chain((hash) => env.saveUser({ ...input, password: hash })),
        TE.chain((user) =>
          pipe(
            env.createToken({ userId: String(user.id), email: user.email }),
            TE.map((token) => ({ user: toPublicUser(user), token }))
          )
        ),
        RTE.fromTaskEither,
      )
    )
  );
```

`TCreateUserEnv` to interfejs deklarujący jakich efektów potrzebuje use case:

```typescript
export interface TCreateUserEnv {
  getUserByEmail: (email: string) => TE.TaskEither<Error, TDbUser | null>;
  hashPassword:   (pw: string)    => TE.TaskEither<Error, string>;
  saveUser:       (u: TUserToSave) => TE.TaskEither<Error, TDbUser>;
  createToken:    (payload: object) => TE.TaskEither<Error, string>;
}
```

### Wiring w Shell (route handler)

```typescript
// apps/functional/src/users/shell/routes/registerUser.ts
const env: TCreateUserEnv = {
  getUserByEmail: (email) => getUserByEmail(pool, email),
  hashPassword:   (pw)    => TE.tryCatch(() => bcrypt.hash(pw, 10), toError),
  saveUser:       (user)  => saveUser(pool, user),
  createToken:    (data)  => TE.right(jwt.sign(data, JWT_SECRET)),
};

const result = await createUser(input)(env)();
// result: E.Either<Error, TCreateUserResult>
```

### Struktura katalogów (jeden feature)

```
src/users/
├── core/
│   ├── usecases/
│   │   ├── createUser.ts       # RTE<TCreateUserEnv, Error, TCreateUserResult>
│   │   └── loginUser.ts        # RTE<TLoginEnv, Error, TLoginResult>
│   └── types/
│       ├── common/             # TDbUser, TPublicUser, TUserToSave
│       ├── createUser/         # TCreateUserInput, TCreateUserEnv, TCreateUserResult
│       └── loginUser/          # TLoginInput, TLoginEnv, TLoginResult
└── shell/
    ├── routes/
    │   ├── registerUser.ts     # POST /api/users/register
    │   └── loginUser.ts        # POST /api/auth/login
    ├── db/
    │   ├── getUserByEmail.ts   # SELECT z bazy
    │   └── saveUser.ts         # INSERT do bazy
    ├── validation/             # Schematy Zod dla DTO
    ├── factories/              # userFactory.ts (DTO → domain input)
    └── dtos/                   # Typy TypeScript dla żądań HTTP
```

### Aliasy ścieżek

| Alias | Rozwiązanie |
|-------|-------------|
| `@common/*` | `src/common/*` |
| `@users/*` | `src/users/*` |
| `@categories/*` | `src/categories/*` |
| `@products/*` | `src/products/*` |
| `@cart/*` | `src/cart/*` |
| `@orders/*` | `src/orders/*` |

Rozwiązywane przez `tsconfig-paths` (dev), `tsc-alias` (build), `moduleNameMapper` (Jest).

---

## Architektura — implementacja OOP

**Wzorzec:** trójwarstwowy Controller → Service → Repository z wstrzykiwaniem zależności przez konstruktor.

### Warstwy

**Repository** — dostęp do bazy:
```typescript
// apps/oop/src/users/UserRepository.ts
class UserRepository {
  constructor(private pool: Pool) {}

  async findByEmail(email: string): Promise<DbUser | null> { /* SELECT */ }
  async save(user: UserToSave): Promise<DbUser>            { /* INSERT */ }
}
```

**Service** — logika biznesowa:
```typescript
// apps/oop/src/users/UserService.ts
class UserService {
  constructor(
    private userRepository: Pick<UserRepository, 'findByEmail' | 'save'>,
    private passwordService: IPasswordService,
    private tokenService: ITokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) throw new Error('UserAlreadyExists');

    const hashed = await this.passwordService.hash(dto.password);
    const saved   = await this.userRepository.save({ ...dto, password: hashed });
    const token   = this.tokenService.sign({ userId: String(saved.id), email: saved.email });

    return { user: toPublicUser(saved), token };
  }
}
```

**Controller** — obsługa HTTP:
```typescript
// apps/oop/src/users/UserController.ts
class UserController {
  router = Router();

  constructor(private userService: UserService) {
    this.router.post('/api/users/register', this.register);
    this.router.post('/api/auth/login',     this.login);
  }

  private register = async (req: Request, res: Response) => {
    const dto    = RegisterSchema.parse(req.body);
    const result = await this.userService.register(dto);
    res.status(201).json(ApiResponse.success(result, 'User registered'));
  };
}
```

**Wiring DI** w `apps/oop/src/app.ts`:
```typescript
export function buildApp(pool: Pool): Express {
  const userRepo       = new UserRepository(pool);
  const passwordSvc    = new BcryptPasswordService();
  const tokenSvc       = new JwtTokenService(JWT_SECRET);
  const userService    = new UserService(userRepo, passwordSvc, tokenSvc);
  const userController = new UserController(userService);

  app.use(userController.router);
  // analogicznie: categories, products, cart, orders
  return app;
}
```

### Format odpowiedzi API

Obie implementacje zwracają identyczny kształt:

```json
// Sukces
{ "success": true, "data": { ... }, "message": "User registered" }

// Błąd
8{ "success": false, "error": { "type": "UserAlreadyExists", "details": null }, "message": "..." }
```

---

## Schemat bazy danych

```
users
  id SERIAL PK | email TEXT UNIQUE | password TEXT
  name TEXT | surname TEXT | created_at TIMESTAMP

categories
  id SERIAL PK | name TEXT UNIQUE | created_at TIMESTAMP

products
  id SERIAL PK | name TEXT | description TEXT | price NUMERIC(10,2)
  stock_quantity INT | category_id FK→categories | created_at TIMESTAMP

carts
  id SERIAL PK | user_id FK→users UNIQUE | created_at TIMESTAMP
  (1 koszyk per użytkownik)

cart_items
  id SERIAL PK | cart_id FK→carts | product_id FK→products | quantity INT

orders
  id SERIAL PK | user_id FK→users
  status ENUM('pending','cancelled') | total_price NUMERIC(10,2) | created_at TIMESTAMP

order_items
  id SERIAL PK | order_id FK→orders | product_id FK→products
  quantity INT | price_at_purchase NUMERIC(10,2)
  (cena utrwalona w momencie złożenia zamówienia)
```

Migracje uruchamiane automatycznie przy starcie aplikacji w kolejności alfabetycznej z `database/migrations/`.

---

## API — endpointy

### Autoryzacja

Zabezpieczone endpointy wymagają nagłówka `Authorization: Bearer <token>`.

### Users

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `POST` | `/api/users/register` | — | Rejestracja nowego użytkownika |
| `POST` | `/api/auth/login` | — | Logowanie, zwraca JWT |
| `GET` | `/api/me` | tak | Dane zalogowanego użytkownika |

### Categories

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `GET` | `/api/categories` | — | Lista wszystkich kategorii |
| `POST` | `/api/categories` | tak | Utwórz kategorię |

### Products

| Metoda | Ścieżka | Auth | Query params | Opis |
|--------|---------|------|-------------|------|
| `GET` | `/api/products` | — | `page`, `limit`, `category_id`, `search` | Lista produktów z filtrowaniem |
| `GET` | `/api/products/:id` | — | — | Szczegóły produktu |
| `POST` | `/api/products` | tak | — | Utwórz produkt |

### Cart

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `GET` | `/api/cart` | tak | Zawartość koszyka |
| `POST` | `/api/cart/items` | tak | Dodaj produkt do koszyka |
| `PUT` | `/api/cart/items/:productId` | tak | Zmień ilość produktu |
| `DELETE` | `/api/cart/items/:productId` | tak | Usuń produkt z koszyka |
| `DELETE` | `/api/cart` | tak | Wyczyść koszyk |

### Orders

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `POST` | `/api/orders` | tak | Złóż zamówienie (atomowa transakcja) |
| `GET` | `/api/orders` | tak | Historia zamówień użytkownika |
| `GET` | `/api/orders/:id` | tak | Szczegóły zamówienia |
| `PATCH` | `/api/orders/:id/cancel` | tak | Anuluj zamówienie |

### Diagnostics / Health

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `GET` | `/` | — | Health check |
| `GET` | `/api/diagnostics` | — | Metryki Node.js (heap, event loop lag, GC) |

---

## Uruchamianie aplikacji

### Wymagania

- Node.js 18+
- Docker + Docker Compose
- k6 (tylko do benchmarków) — [instalacja](https://k6.io/docs/get-started/installation/)
- Python 3.9+ z `matplotlib`, `numpy` (tylko do analizy)

### Instalacja zależności

```bash
npm install
```

### Tryb deweloperski (bez Dockera)

Wymagana działająca instancja PostgreSQL na `localhost:5432`. Skopiuj `.env.example` do `.env` i wypełnij dane.

```bash
# Terminal 1 — implementacja funkcyjna (port 3000)
npm run dev:functional

# Terminal 2 — implementacja OOP (port 3001)
npm run dev:oop
```

### Docker Compose (zalecane — środowisko benchmarku)

```bash
# Uruchom PostgreSQL + obie aplikacje
docker compose up

# Uruchom w tle
docker compose up -d

# Zatrzymaj
docker compose down

# Zatrzymaj i usuń dane (baza)
docker compose down -v
```

Limity zasobów kontenerów (zdefiniowane w `docker-compose.yml`):
- `app-functional` — 1 CPU, 512 MB RAM
- `app-oop` — 1 CPU, 512 MB RAM
- `postgres` — 2 CPU, 1 GB RAM

### Zmienne środowiskowe

```env
DB_HOST=localhost       # postgres (wewnątrz Dockera)
DB_PORT=5432
DB_NAME=mg_thesis
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-secret
PORT=3000               # lub 3001 dla OOP
```

### Ręczne testowanie endpointów

Pliki `.http` w katalogu `requests/` zawierają gotowe żądania dla obu aplikacji. Wymagają wtyczki REST Client (VS Code) lub JetBrains HTTP Client.

```
requests/
├── users.http       # register, login
├── categories.http  # list, create
├── products.http    # list (z filtrami), detail, create
├── cart.http        # get, add, update, remove, clear
├── orders.http      # place, list, detail, cancel
├── me.http          # profil zalogowanego użytkownika
├── health.http      # health check
└── diagnostics.http # metryki Node.js
```

---

## Testy

### Struktura testów

Każda aplikacja ma dwa rodzaje testów:

**Testy jednostkowe use case'ów** — testują logikę biznesową w izolacji. W implementacji funkcyjnej `TEnv` jest podstawiany jako literał z zamockowanymi funkcjami, bez potrzeby frameworku mockującego:

```typescript
// apps/functional/__tests__/users/createUser.usecase.test.ts
test('zwraca błąd gdy użytkownik istnieje', async () => {
  const env: TCreateUserEnv = {
    getUserByEmail: () => TE.right(existingUser),  // symuluje znalezienie usera
    hashPassword:   () => TE.right('hash'),
    saveUser:       () => TE.right(dbUser),
    createToken:    () => TE.right('token'),
  };

  const result = await createUser(input)(env)();
  expect(E.isLeft(result)).toBe(true);
  expect((result as E.Left<Error>).left.message).toBe('UserAlreadyExists');
});
```

W OOP testowane są serwisy z zamockowanymi repozytoriami (jest.fn()):

```typescript
// apps/oop/__tests__/users/userService.test.ts
test('throws gdy użytkownik istnieje', async () => {
  mockUserRepo.findByEmail.mockResolvedValue(existingUser);
  await expect(userService.register(dto)).rejects.toThrow('UserAlreadyExists');
});
```

**Testy integracyjne routes** — uruchamiają pełną aplikację Express z prawdziwą bazą danych (testową) przez `supertest`:

```typescript
// apps/functional/__tests__/users/register.test.ts
test('POST /api/users/register zwraca 201', async () => {
  const res = await request(app)
    .post('/api/users/register')
    .send({ email: 'new@test.com', password: 'Password1', name: 'Jan', surname: 'Kowalski' });

  expect(res.status).toBe(201);
  expect(res.body.success).toBe(true);
  expect(res.body.data.token).toBeDefined();
});
```

### Pokrycie testami

| Obszar | Functional | OOP |
|--------|-----------|-----|
| Rejestracja użytkownika | unit + integracja | unit + integracja |
| Logowanie | unit + integracja | unit + integracja |
| Kategorie | unit + integracja | unit + integracja |
| Produkty | unit + integracja | unit + integracja |
| Koszyk | unit + integracja | unit + integracja |
| Zamówienia | integracja | unit + integracja |
| Auth middleware (JWT) | tak | tak |
| Endpoint `/api/me` | tak | tak |
| Startup bazy / migracje | tak | — |

### Uruchamianie testów

```bash
# Wszystkie testy (obie aplikacje)
npm test

# Tylko functional
npm run test:functional

# Tylko OOP
npm run test:oop

# Jeden plik testowy
npm run test:functional -- --testPathPattern="createUser"

# Jeden test po nazwie
npm run test:functional -- --testNamePattern="zwraca błąd"
```

Wymagana baza PostgreSQL dostępna podczas testów integracyjnych (zmienne `DB_*` z `.env`).

---

## Benchmark

### Koncepcja

Każdy scenariusz testuje **jeden endpoint** w izolacji. Obie implementacje uruchamiane są sekwencyjnie (reset bazy między przebiegami) przy identycznych warunkach:

```
reset DB → [functional] k6 + docker stats + diagnostics → cooldown → reset DB → [OOP] k6 + docker stats + diagnostics
```

### Wymagania sprzętowe (dla powtarzalnych wyników)

- CPU: 4 rdzenie (2 dla kontenerów, 2 dla PostgreSQL + k6)
- RAM: 8 GB
- Dysk: SSD

### Scenariusze (S1–S6)

| ID | Endpoint | Typ operacji | Hipoteza |
|----|----------|-------------|---------|
| **S1** | `POST /api/users/register` | CPU-bound (bcrypt hash) | Minimalna różnica — bcrypt dominuje czas odpowiedzi |
| **S2** | `POST /api/auth/login` | CPU-bound (bcrypt compare + JWT sign) | Minimalna różnica |
| **S3** | `GET /api/products?page=1&limit=20` | Czysty odczyt z filtrowaniem | Możliwy narzut fp-ts — mała latencja DB eksponuje overhead |
| **S4** | `GET /api/products/:id` | Odczyt po kluczu głównym | Najszybsza operacja — proporcjonalnie największy narzut architektury |
| **S5** | `POST /api/cart/items` | JWT verify + walidacja stocku + zapis | Złożona logika — widoczna różnica zarządzania efektami |
| **S6** | `POST /api/orders` | Pełna transakcja PostgreSQL | Najważniejszy scenariusz — RTE chain vs async/await + try/catch |

### Profile obciążenia (A–D)

| Profil | Wirtualni użytkownicy | Czas trwania | Cel |
|--------|-----------------------|-------------|-----|
| **A** | 1 VU stały | 30 s | Baseline — czysta różnica latencji bez rywalizacji |
| **B** | ramp 0→20 (30s), plateau 20 (2m), ramp 20→0 (30s) | ~3 min | Normalne obciążenie produkcyjne |
| **C** | ramp 0→100 (1m), plateau 100 (3m), ramp 100→0 (1m) | ~5 min | Obciążenie szczytowe — GC pressure |
| **D** | ramp 0→200 (2m), plateau 200 (5m), ramp 200→0 (2m) | ~9 min | Stress test — szukanie punktu degradacji |

Macierz pełnego benchmarku: **6 scenariuszy × 4 profile × 2 implementacje = 48 przebiegów k6**.

Szacowany czas (pełna macierz): **3–4 godziny**.

### Metryki zbierane

**k6 (HTTP):**

| Metryka | Opis |
|---------|------|
| `http_req_duration` avg / p50 / p95 / p99 | Czas odpowiedzi HTTP |
| `http_req_waiting` | TTFB (Time To First Byte) |
| `http_reqs` rate | Przepustowość (req/s) |
| `http_req_failed` | Odsetek błędów (%) |
| `iterations` | Całkowita liczba iteracji |

**docker stats (co 1 sekundę):**

| Metryka | Opis |
|---------|------|
| `cpu_pct` | Zużycie CPU kontenera (%) |
| `mem_usage` | Zużycie pamięci (MB) |
| `mem_pct` | % limitu pamięci kontenera |

**Diagnostics endpoint `/api/diagnostics` (co 1 sekundę):**

| Metryka | Opis |
|---------|------|
| `eventLoopLag.mean` / `.p99` | Opóźnienie event loop Node.js (ms) |
| `heap.used` / `.total` | Sterta V8 (MB) |
| `rss` | Resident Set Size — całkowita pamięć procesu (MB) |
| `gcPauses.ms` | Łączny czas pauz GC (ms) |
| `gcPauses.count` | Liczba cykli GC |

### Nazewnictwo plików wynikowych

```
benchmarks/results/
├── s3_B_functional_1780299554.json          # k6 JSONL — wyniki HTTP
├── s3_B_oop_1780299554.json
├── s3_B_functional_stats_1780299554.csv     # docker CPU/RAM (co 1s)
├── s3_B_oop_stats_1780299554.csv
├── s3_B_functional_diag_func_1780299554.jsonl   # diagnostics functional (pobierane podczas testu functional)
├── s3_B_functional_diag_oop_1780299554.jsonl    # diagnostics OOP (pobierane równolegle)
└── ...
```

Format: `<scenario>_<profile>_<impl>_<timestamp>.<ext>`

### Uruchamianie benchmarku

#### Przygotowanie środowiska

```bash
# 1. Uruchom obie aplikacje w Dockerze
docker compose up -d

# 2. Poczekaj na health check (aplikacje muszą być gotowe)
docker compose ps

# 3. Zresetuj bazę do stanu benchmark (910k rekordów seed)
npm run bench:reset
```

#### Jeden scenariusz

```bash
# Składnia: ./benchmarks/run_single.sh <scenariusz> <profil>
./benchmarks/run_single.sh s3 A    # S3 (lista produktów), profil A (baseline)
./benchmarks/run_single.sh s6 B    # S6 (złożenie zamówienia), profil B (20 VU)
```

Skrypt wykona kolejno:
1. Reset bazy
2. Uruchomienie kolektorów (docker stats + diagnostics) w tle
3. k6 dla implementacji funkcyjnej
4. Zatrzymanie kolektorów + cooldown 30s
5. Reset bazy
6. Kolektory + k6 dla OOP
7. Zapis wyników do `benchmarks/results/`

#### Wiele scenariuszy / profile

```bash
# Wszystkie scenariusze, wszystkie profile (S1–S6 × A–D) — ok. 3–4 godziny
./benchmarks/run_all.sh

# Wybrane scenariusze, wszystkie profile
./benchmarks/run_all.sh s3 s4

# Wszystkie scenariusze, wybrane profile
PROFILES="A B" ./benchmarks/run_all.sh

# Wybrane scenariusze i profile
PROFILES="A B" ./benchmarks/run_all.sh s3 s4 s6
```

#### Nadpisanie adresów URL (opcjonalne)

```bash
BASE_URL_FUNC=http://localhost:3000 \
BASE_URL_OOP=http://localhost:3001 \
./benchmarks/run_single.sh s3 A
```

---

## Analiza wyników

### Uruchamianie skryptu

```bash
# Z katalogu głównego repo
python3 benchmarks/analysis/compare.py

# Z niestandardowymi katalogami
python3 benchmarks/analysis/compare.py \
  --results-dir benchmarks/results \
  --output-dir  benchmarks/analysis/charts
```

### Wymagane pakiety Python

```bash
pip install matplotlib numpy
```

### Co generuje `compare.py`

**Na konsoli** — tabela porównawcza dla każdej pary (scenariusz, profil):

```
S3 / Profile A — Baseline (1 VU, 30s)
┌───────────────────┬────────────┬──────────┬──────────┐
│ Metryka           │ Functional │ OOP      │ Różnica  │
├───────────────────┼────────────┼──────────┼──────────┤
│ avg latency (ms)  │ 5.9        │ 6.8      │ -13.3%   │
│ p50 (ms)          │ 5.5        │ 6.4      │          │
│ p95 (ms)          │ 8.2        │ 9.9      │          │
│ p99 (ms)          │ 11.1       │ 13.5     │          │
│ req/s             │ 157.3      │ 144.1    │ +9.2%    │
│ error rate (%)    │ 0.00       │ 0.00     │          │
│ avg CPU %         │ 12.3       │ 13.7     │          │
│ avg MEM (MB)      │ 98.4       │ 101.2    │          │
└───────────────────┴────────────┴──────────┴──────────┘
```

**Wykresy PNG** w `benchmarks/analysis/charts/`:

Na każdy run (scenariusz + profil):

| Plik | Zawartość |
|------|-----------|
| `s3_A_<ts>_latency_throughput.png` | Grouped bar: latencja p95 + przepustowość req/s |
| `s3_A_<ts>_resources.png` | Linie czasowe: CPU % i RAM — functional vs OOP |
| `s3_A_<ts>_diagnostics.png` | Linie czasowe: event loop lag, heap, GC pauses — functional vs OOP |

Zbiorczy:

| Plik | Zawartość |
|------|-----------|
| `summary.png` | Grouped bar: p95 i req/s dla wszystkich S1–S6 obok siebie |

---

## Pytania badawcze i hipotezy

### Pytania badawcze

1. Czy architektura FCIS z `fp-ts` ma mierzalny narzut wydajnościowy względem klasycznego OOP?
2. Przy jakiej skali obciążenia (VU) różnice stają się istotne?
3. Które operacje są najbardziej wrażliwe na wybór architektury?
4. Jak wzorzec alokacji pamięci różni się między implementacjami? (fp-ts tworzy wiele małych obiektów `Either`/`Task`/`Reader`)

### Hipotezy

| ID | Hipoteza | Uzasadnienie |
|----|---------|-------------|
| **H1** | S1/S2 (bcrypt) — identyczna wydajność | bcrypt dominuje czas odpowiedzi, narzut architektury jest pomijalny |
| **H2** | S3/S4 (odczyty) — functional może być nieznacznie wolniejszy | fp-ts alokuje więcej małych obiektów → większe ciśnienie GC |
| **H3** | Profil D — różnica rośnie | GC pauses V8 częstsze przy wyższej liczbie alokacji fp-ts |
| **H4** | S6 (placeOrder) — największa różnica strukturalna | RTE chain tworzy więcej domknięć niż liniowy async/await + try/catch |
| **H5** | Zużycie pamięci wyższe w functional | Stałe alokacje `Either`/`Task`/`Option`/`Reader` — więcej obiektów na stercie |

### Ograniczenia metodologiczne

- Benchmark na jednej maszynie — wyniki są powtarzalne **względnie**, nie absolutnie
- Współdzielona baza PostgreSQL — przy dużym obciążeniu może stać się wąskim gardłem dla obu
- JIT kompilacji V8 może faworyzować jeden wzorzec po rozgrzaniu — uwzględnić warmup
- Node.js jest jednowątkowy — CPU-bound (bcrypt) maskuje różnice architektoniczne

---

## Szybki start (TL;DR)

```bash
# Instalacja
npm install

# Start (Docker)
docker compose up -d

# Testy
npm test

# Jeden benchmark (S3, baseline)
./benchmarks/run_single.sh s3 A

# Analiza wyników
python3 benchmarks/analysis/compare.py
```
