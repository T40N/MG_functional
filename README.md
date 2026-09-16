# Praca magisterska — Functional vs OOP w TypeScript/Express.js

Monorepo zawierające dwie implementacje tego samego REST API e-commerce: funkcyjną (`fp-ts`, FCIS) oraz obiektową (Controller–Service–Repository). Celem projektu jest empiryczne porównanie wydajności i charakterystyki zasobów obu podejść za pomocą benchmarków k6.

Repozytorium zawiera **kod źródłowy obu implementacji i kompletną aparaturę pomiarową**. Tekst pracy oraz surowe dane pomiarowe (pełna seria to ok. 300 GB) są poza repozytorium — poniższa instrukcja opisuje, jak odtworzyć zarówno aplikacje, jak i wszystkie pomiary od zera.

---

## Spis treści

1. [Struktura projektu](#struktura-projektu)
2. [Wymagania wstępne](#wymagania-wstępne)
3. [Uruchamianie aplikacji](#uruchamianie-aplikacji)
4. [Testy, lint i build](#testy-lint-i-build)
5. [Architektura — implementacja funkcyjna](#architektura--implementacja-funkcyjna)
6. [Architektura — implementacja OOP](#architektura--implementacja-oop)
7. [Schemat bazy danych](#schemat-bazy-danych)
8. [API — endpointy](#api--endpointy)
9. [Badania — benchmark wydajnościowy](#badania--benchmark-wydajnościowy)
10. [Analiza wyników](#analiza-wyników)
11. [Pozostałe pomiary](#pozostałe-pomiary)
12. [Rozwiązywanie problemów](#rozwiązywanie-problemów)
13. [Pytania badawcze i hipotezy](#pytania-badawcze-i-hipotezy)
14. [Szybki start (TL;DR)](#szybki-start-tldr)

---

## Struktura projektu

```
.
├── apps/
│   ├── functional/          # Implementacja funkcyjna (kontener :3000 → host :3100)
│   └── oop/                 # Implementacja OOP      (kontener :3001 → host :3001)
├── benchmarks/
│   ├── k6/
│   │   ├── scenarios/       # s1_register.js … s6_place_order.js
│   │   └── helpers/         # auth.js (logowanie), profiles.js (profile A–D + WARMUP)
│   ├── seed/reset.ts        # Reset stanu bazy przed każdym pomiarem
│   ├── run_single.sh        # Jeden scenariusz × jeden profil, obie implementacje
│   ├── run_all.sh           # Macierz: scenariusze × profile × powtórzenia
│   ├── run_analysis.sh      # compare.py → benchmarks/reports/benchmark_wyniki.txt
│   ├── analysis/
│   │   ├── compare.py        # Analiza główna: tabele, wykresy, agregacja powtórzeń
│   │   ├── h5_per_request.py # Normalizacja metryk H5 na 1000 żądań
│   │   └── charts/           # Wykresy PNG (poza gitem)
│   ├── probes/              # Sondy wyjaśniające anomalię S3 (pg_stat_statements)
│   ├── static/              # Metryki statyczne kodu (SLOC, złożoność cyklomatyczna)
│   ├── reports/             # Tekstowe wyniki analiz (tworzony przy pierwszym uruchomieniu)
│   └── results/             # Surowe wyniki k6 / docker stats / diagnostics (poza gitem)
├── database/
│   └── migrations/          # 001–010, uruchamiane przy starcie obu aplikacji
├── requests/                # Pliki .http do ręcznego testowania API
├── docker-compose.yml
└── package.json             # Monorepo (npm workspaces)
```

Obie aplikacje współdzielą tę samą instancję PostgreSQL, ten sam katalog migracji i identyczny schemat — różnią się wyłącznie sposobem organizacji kodu Node.js.

---

## Wymagania wstępne

| Narzędzie | Wersja | Do czego potrzebne |
|---|---|---|
| Docker + Docker Compose | Compose v2 | Uruchomienie bazy i obu aplikacji (środowisko pomiarowe) |
| Node.js | 18+ (rozwijane na 22.x, kontenery używają `node:18`) | `npm install`, testy, `bench:reset`, metryki statyczne |
| k6 | 2.x (pomiary w pracy: v2.0.0) | Scenariusze obciążeniowe — [instalacja](https://k6.io/docs/get-started/installation/) |
| Python | 3.9+ (użyty 3.13) z `matplotlib` i `numpy` | Analiza wyników i wykresy |
| `curl` | dowolna | Kolektory metryk w skryptach pomiarowych |

```bash
# macOS
brew install k6
pip3 install matplotlib numpy
```

Do samego **uruchomienia aplikacji** wystarczą Docker i Node. k6 oraz Python są potrzebne dopiero do badań.

Sprzęt dla powtarzalnych pomiarów: min. 4 rdzenie CPU (2 dla kontenerów aplikacji, 2 dla PostgreSQL i k6), 8 GB RAM, dysk SSD z **ok. 300 GB wolnego miejsca** na pełną macierz. Pomiary w pracy wykonano na MacBooku Pro (Apple M5 Pro, 15 rdzeni, 24 GB RAM, macOS 26.5.2, Docker 29.5.3).

---

## Uruchamianie aplikacji

### 1. Instalacja zależności

```bash
npm install          # z katalogu głównego — instaluje oba workspace'y
```

### 2. Pliki `.env`

Każda aplikacja czyta własny `.env` (oba są w `.gitignore`). W repozytorium leżą wzorce:

```bash
cp apps/functional/.env.example apps/functional/.env
cp apps/oop/.env.example        apps/oop/.env
```

`apps/functional/.env`:

```env
JWT_SECRET=dowolny-losowy-ciag

DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=postgres      # nazwa usługi w sieci compose
DB_PORT=5432          # port WEWNĄTRZ sieci compose

PORT=3000
```

`apps/oop/.env` — identycznie, z `PORT=3001`.

Trzy rzeczy, które łatwo przeoczyć:

- `DB_HOST=postgres` i `DB_PORT=5432` to adres **wewnątrz sieci Dockera**. Z hosta ta sama baza jest pod `localhost:55432` — port 5432 na maszynie deweloperskiej często należy do innego projektu, więc `docker-compose.yml` celowo go przemapowuje.
- `docker-compose.yml` używa `apps/functional/.env` także jako `env_file` kontenera Postgresa, ale zmienne `POSTGRES_*` interpoluje ze środowiska powłoki i z pliku `.env` w katalogu głównym (wartości domyślne: `postgres`/`postgres`/`postgres`). Jeśli zmienisz `DB_NAME`/`DB_USER`/`DB_PASSWORD` w aplikacjach, ustaw je również w powłoce — inaczej świeży wolumen zainicjuje się z innymi danymi i aplikacje się nie połączą.
- `JWT_SECRET` może być w obu aplikacjach dowolny i nie musi być wspólny — scenariusze benchmarku logują się osobno do każdej aplikacji.

### 3. Uruchomienie w Dockerze (środowisko pomiarowe — zalecane)

```bash
docker compose up -d
```

| Kontener | Usługa | Port hosta | Limity zasobów |
|---|---|---|---|
| `my_postgres` | PostgreSQL 15 (+ `pg_stat_statements`) | **55432** → 5432 | 2 CPU, 1 GB RAM |
| `mg_functional` | implementacja funkcyjna | **3100** → 3000 | 1 CPU, 512 MB RAM |
| `mg_oop` | implementacja OOP | **3001** → 3001 | 1 CPU, 512 MB RAM |

Równe limity zasobów są częścią metodyki — obie aplikacje dostają dokładnie tyle samo.

**Pierwszy start trwa kilka minut.** Kontener wykonuje kolejno `npm install`, `npm run build`, `node dist/index.js`, a przy pustej bazie uruchamiane są migracje `001`–`010`, w tym `009_seed_benchmark_data.sql` wstawiająca **910 021 rekordów** (20 kategorii, 10 001 użytkowników, 100 000 produktów, 200 000 zamówień, 600 000 pozycji). Dlatego `start_period` health-checku wynosi 120 s.

```bash
docker compose ps                      # STATUS ma być "healthy"
docker compose logs -f app-functional  # podgląd migracji i startu
```

Weryfikacja:

```bash
curl -s http://localhost:3100/ && echo                 # functional — health check
curl -s http://localhost:3001/ && echo                 # oop
curl -s "http://localhost:3100/api/products?limit=2"   # dane z seeda
```

Zatrzymanie:

```bash
docker compose stop        # zatrzymaj, zachowaj dane
docker compose down        # usuń kontenery, zachowaj wolumen z bazą
docker compose down -v     # usuń także dane — następny start ponowi seed (kilka minut)
```

### 4. Uruchomienie lokalne, bez Dockera (tryb deweloperski)

Tryb do pracy nad kodem — **nie do pomiarów** (brak limitów CPU/RAM, inny profil procesu).

```bash
docker compose up -d postgres    # sama baza; albo własna instancja PostgreSQL

# Terminal 1 — implementacja funkcyjna → http://localhost:3000
DB_HOST=localhost DB_PORT=55432 npm run dev:functional

# Terminal 2 — implementacja OOP → http://localhost:3001
DB_HOST=localhost DB_PORT=55432 npm run dev:oop
```

Zmienne z powłoki nadpisują `.env`. Uwaga na porty: w Dockerze aplikacja funkcyjna odpowiada na **3100**, uruchomiona lokalnie — na **3000** (wartość `PORT`). Oba polecenia używają `ts-node-dev --respawn`, więc przeładowują się po zmianie pliku; migracje odpalają się przy każdym starcie (runner pomija już wykonane).

### 5. Ręczne testowanie endpointów

Katalog `requests/` zawiera gotowe żądania dla obu aplikacji (REST Client w VS Code albo HTTP Client w JetBrains):

```
requests/
├── users.http       # rejestracja, logowanie
├── categories.http  # lista, tworzenie
├── products.http    # lista z filtrami, szczegóły, tworzenie
├── cart.http        # pobranie, dodanie, zmiana ilości, usunięcie, czyszczenie
├── orders.http      # złożenie, historia, szczegóły, anulowanie
├── me.http          # profil zalogowanego użytkownika
├── health.http      # health check
└── diagnostics.http # metryki Node.js i ich zerowanie
```

Konta z danych seedowych: `bench@test.com` oraz `seed_1@test.com` … `seed_10000@test.com`, hasło `Password1`.

---

## Testy, lint i build

```bash
npm test                     # obie aplikacje
npm run test:functional      # functional — 98 testów w 17 plikach
npm run test:oop             # OOP        — 90 testów w 12 plikach

npm run test:functional -- --testPathPattern="createUser"    # jeden plik
npm run test:functional -- --testNamePattern="zwraca błąd"   # jeden test po nazwie

npm run lint                 # ESLint w obu workspace'ach
npm run build:functional     # tsc + tsc-alias → apps/functional/dist
npm run build:oop
```

**Testy nie wymagają działającej bazy danych.** Obie aplikacje zaślepiają w testach moduły dostępu do bazy, `bcrypt` i `jsonwebtoken`, więc `npm test` przechodzi przy zatrzymanym Dockerze. Testy tras (`supertest`) uruchamiają pełną aplikację Express, ale z zaślepionymi efektami — sprawdzają warstwę HTTP i kontrakt odpowiedzi, nie integrację z PostgreSQL.

W implementacji funkcyjnej atrapy efektów podaje się wprost jako rekord `env`, bez biblioteki mockującej:

```typescript
// apps/functional/__tests__/users/createUser.usecase.test.ts
const env: TCreateUserEnv = {
  getUserByEmail: () => TE.right(existingUser),
  hashPassword:   () => TE.right('hash'),
  saveUser:       () => TE.right(dbUser),
  createToken:    () => TE.right('token'),
};

const result = await createUser(input)(env)();
expect(E.isLeft(result)).toBe(true);
```

w obiektowej — jako atrapy `jest.fn()` wstrzykiwane w konstruktorze:

```typescript
// apps/oop/__tests__/users/userService.test.ts
mockUserRepo.findByEmail.mockResolvedValue(existingUser);
await expect(userService.register(dto)).rejects.toThrow('UserAlreadyExists');
```

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

`TCreateUserEnv` deklaruje, jakich efektów potrzebuje use case:

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
{ "success": true, "data": { }, "message": "User registered" }

// Błąd
{ "success": false, "error": { "type": "UserAlreadyExists", "details": null }, "message": "..." }
```

---

## Schemat bazy danych

```
users
  id SERIAL PK | email TEXT UNIQUE | password TEXT
  name TEXT | surname TEXT | created_at TIMESTAMP

categories
  id SERIAL PK | name TEXT UNIQUE | description TEXT | created_at TIMESTAMP

products
  id SERIAL PK | name TEXT | description TEXT | price NUMERIC(10,2)
  stock_quantity INT | category_id FK→categories | created_at TIMESTAMP

cart_items
  id SERIAL PK | user_id FK→users | product_id FK→products | quantity INT
  reserved_at TIMESTAMP | expires_at TIMESTAMP (domyślnie +15 min)
  UNIQUE(user_id, product_id)
  (koszyk nie ma osobnej encji — pozycje wiążą się wprost z użytkownikiem)

orders
  id SERIAL PK | user_id FK→users
  status VARCHAR CHECK IN ('pending','cancelled') | total_price NUMERIC(10,2)
  created_at TIMESTAMP

order_items
  id SERIAL PK | order_id FK→orders | product_id FK→products
  quantity INT | price_at_purchase NUMERIC(10,2)
  (cena utrwalona w momencie złożenia zamówienia)
```

Migracje leżą w `database/migrations/` i są uruchamiane automatycznie przy starcie **obu** aplikacji, w kolejności alfabetycznej (runner pomija już wykonane). Katalog montowany jest do kontenerów jako `/database/migrations` (zmienna `MIGRATIONS_DIR`).

| Migracja | Zawartość |
|---|---|
| `001`–`003` | tabela `users` (oraz wycofany `client_number`) |
| `004`–`005` | `categories`, `products` |
| `006`–`007` | `cart_items`, `orders`, `order_items` |
| `008` | `pg_stat_statements` — wymagane przez sondy z `benchmarks/probes/` |
| `009` | dane seedowe benchmarku — 910 021 rekordów |
| `010` | indeksy na kluczach obcych |

---

## API — endpointy

Obie implementacje wystawiają **dokładnie te same 20 punktów końcowych** (liczone automatycznie przez `benchmarks/static/collect.js` — niezależne potwierdzenie równoważności funkcjonalnej). Endpointy oznaczone „auth" wymagają nagłówka `Authorization: Bearer <token>`.

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

### Health i diagnostyka

| Metoda | Ścieżka | Auth | Opis |
|--------|---------|------|------|
| `GET` | `/` | — | Health check (używany przez health-check kontenera) |
| `GET` | `/api/diagnostics` | — | Migawka metryk Node.js: sterta, RSS, opóźnienie pętli zdarzeń, pauzy GC |
| `POST` | `/api/diagnostics/reset` | — | Zerowanie liczników — wywoływane po rozgrzewce JIT, tuż przed oknem pomiaru |

---

## Badania — benchmark wydajnościowy

### Koncepcja

Każdy scenariusz obciąża **jeden endpoint** w izolacji. Obie implementacje mierzone są sekwencyjnie, nigdy równolegle, w identycznych warunkach. Pojedynczy pomiar (`run_single.sh <scenariusz> <profil>`) wykonuje dla każdej implementacji:

1. **Reset bazy** — usunięcie osadu po poprzednich przebiegach (`benchmarks/seed/reset.ts`).
2. **Restart obu kontenerów** — liczniki GC, histogram pętli zdarzeń i sterta startują od zera, a obie aplikacje mają w chwili pomiaru ten sam wiek procesu. Restartowana jest także aplikacja bezczynna, bo jej stan też ma być za każdym razem taki sam.
3. **Rozgrzewka JIT** — profil `WARMUP` (10 VU × 30 s), wyniki odrzucane. Bez niej pomiar miesza dwa reżimy wykonania V8 (Georges i in., OOPSLA 2007).
4. **Zerowanie `/api/diagnostics`** — po rozgrzewce, tuż przed oknem pomiaru, żeby snapshot nie obejmował pracy odśmiecacza z rozgrzewki.
5. **Start kolektorów** — `docker stats` i `/api/diagnostics` próbkowane co 1 s (obie aplikacje jednocześnie).
6. **Przebieg k6** — właściwe okno pomiaru.
7. **Wychłodzenie 30 s** i to samo dla drugiej implementacji.

Kolejność implementacji jest **naprzemienna**: w powtórzeniach nieparzystych pierwszy jest functional, w parzystych OOP. Dzięki temu pozostałości po pierwszym przebiegu (rozgrzany cache bazy, narosłe tabele) nie obciążają systematycznie zawsze tej samej implementacji.

### Scenariusze (S1–S6)

| ID | Endpoint | Typ operacji |
|----|----------|-------------|
| **S1** | `POST /api/users/register` | CPU-bound (bcrypt hash) |
| **S2** | `POST /api/auth/login` | CPU-bound (bcrypt compare + JWT sign) |
| **S3** | `GET /api/products?page=1&limit=20` | Odczyt z filtrowaniem i paginacją |
| **S4** | `GET /api/products/:id` | Odczyt po kluczu głównym — najszybsza operacja |
| **S5** | `POST /api/cart/items` | JWT verify + walidacja stanu magazynowego + zapis |
| **S6** | `POST /api/orders` | Pełna transakcja PostgreSQL (`FOR UPDATE`, odjęcie stanu, czyszczenie koszyka) |

S5 i S6 wymagają autoryzacji — każdy VU loguje się na własne konto `seed_N@test.com`, żeby koszyki się nie mieszały. Żądania przygotowawcze są tagowane (`setup_login`, `setup_cart`) i odfiltrowywane w analizie.

### Profile obciążenia (A–D)

| Profil | Wirtualni użytkownicy | Czas | Cel |
|--------|-----------------------|------|-----|
| **A** | 1 VU stały | 30 s | Baseline — czysta różnica latencji bez rywalizacji |
| **B** | ramp 0→20 (30 s), plateau 20 (2 min), ramp →0 (30 s) | ~3 min | Normalne obciążenie |
| **C** | ramp 0→100 (1 min), plateau 100 (3 min), ramp →0 (1 min) | ~5 min | Obciążenie szczytowe |
| **D** | ramp 0→200 (2 min), plateau 200 (5 min), ramp →0 (2 min) | ~9 min | Stress test |
| `WARMUP` | 10 VU | 30 s | Rozgrzewka JIT, wyniki odrzucane |

Profile **celowo nie mają progów** (`thresholds: {}`). Próg w k6 jest bramką, nie miernikiem: jego przekroczenie kończy proces kodem 99 i porzuca całą kombinację razem z pomiarem drugiej implementacji. Ocena SLO należy do `compare.py`, które i tak liczy p(95) i odsetek błędów.

### Przygotowanie do pomiaru

```bash
# 1. Środowisko pomiarowe
docker compose up -d
docker compose ps                 # oba kontenery "healthy"

# 2. Reset stanu bazy (DB_HOST/DB_PORT są OBOWIĄZKOWE przy uruchamianiu z hosta)
DB_HOST=localhost DB_PORT=55432 npm run bench:reset
```

Bez `DB_HOST=localhost DB_PORT=55432` skrypt weźmie `DB_HOST=postgres` z `apps/functional/.env` (adres wewnątrz sieci Dockera) i nie połączy się z bazą. Skrypty pomiarowe ustawiają te zmienne samodzielnie, więc ręczny reset jest potrzebny tylko przy diagnostyce.

`reset.ts` wykonuje `DELETE`, więc przed czyszczeniem sprawdza, czy połączył się z bazą benchmarku (wymaga kompletu tabel `users`, `categories`, `products`, `cart_items`, `orders`, `order_items`) i odmawia pracy na jakiejkolwiek innej instancji. Usuwa wyłącznie osad po przebiegach: pozycje koszyków, zamówienia spoza puli seedowej, użytkowników zarejestrowanych w S1 oraz przywraca stany magazynowe — dane seedowe zostają nienaruszone.

### Pojedynczy scenariusz

```bash
./benchmarks/run_single.sh s3 A            # S3, profil A, 1 powtórzenie
REPEATS=3 ./benchmarks/run_single.sh s6 B  # S6, profil B, 3 niezależne powtórzenia
```

`REPEATS` to liczba niezależnych powtórzeń całego pomiaru; każde dostaje własny znacznik czasu, więc `compare.py` traktuje je jako osobne przebiegi i agreguje w średnią ± SD z przedziałem ufności. **Do jakiegokolwiek wnioskowania o istotności różnic potrzeba `REPEATS` ≥ 3** (Georges i in., OOPSLA 2007); przy mniejszej liczbie skrypt wypisuje ostrzeżenie.

Nadpisanie adresów, gdy aplikacje działają gdzie indziej:

```bash
BASE_URL_FUNC=http://localhost:3000 \
BASE_URL_OOP=http://localhost:3001 \
DB_HOST=localhost DB_PORT=55432 \
./benchmarks/run_single.sh s3 A
```

### Macierz scenariuszy i profili

```bash
./benchmarks/run_all.sh                        # S1–S6 × A–D, 1 powtórzenie
./benchmarks/run_all.sh s3 s4                  # wybrane scenariusze, wszystkie profile
PROFILES="A B" ./benchmarks/run_all.sh         # wszystkie scenariusze, wybrane profile
PROFILES="A B" REPEATS=5 ./benchmarks/run_all.sh s3 s6
REPEATS=3 ./benchmarks/run_all.sh              # pełna macierz pracy: 72 pary
```

Nieudana kombinacja nie przerywa przebiegu — jest logowana, pętla idzie dalej, a lista niepowodzeń pojawia się w podsumowaniu.

Czas trwania (na jedno powtórzenie, wliczając restarty, rozgrzewkę i wychłodzenia):

| Profil | Czas na scenariusz (obie implementacje) |
|---|---|
| A | ~2 min |
| B | ~8 min |
| C | ~13 min |
| D | ~21 min |

Pełna macierz 6 × 4 to ~3–4 h na powtórzenie; **`REPEATS=3` to ok. 14 h** — przebieg nocny. Wynik zajmuje ok. 300 GB, bo `k6 --out json` zapisuje każdą pojedynczą próbkę HTTP.

### Długi przebieg (nocny)

Trzy rzeczy potrafią zabić wielogodzinny pomiar i wszystkie trzy trzeba wyłączyć z góry:

1. **Uśpienie systemu** — macOS usypia maszynę po wygaszeniu ekranu i zamraża k6. Lekarstwo: `caffeinate -ims` (bez `-d`, ekran ma prawo zgasnąć). `caffeinate` **nie blokuje** uśpienia po zamknięciu klapy — laptop musi mieć otwartą klapę albo podłączony monitor zewnętrzny.
2. **Zamknięcie sesji terminala** — proces będący dzieckiem powłoki ginie razem z nią. Lekarstwo: własna sesja procesów (`setsid`) + `nohup`. macOS nie ma `setsid(1)`, stąd obejście przez Pythona poniżej.
3. **Uruchomienie pomiaru jako zadania w tle agenta/IDE** — zabicie zadania ubija proces razem z całym przebiegiem. Pomiar odpalamy wyłącznie samodzielnie, tak jak niżej.

```bash
LOG="benchmarks/results/full_matrix_$(date +%s).log"

nohup python3 -c 'import os, sys; os.setsid(); os.execvp("caffeinate", ["caffeinate", "-ims"] + sys.argv[1:])' \
  env REPEATS=3 ./benchmarks/run_all.sh > "$LOG" 2>&1 &
disown

echo "$LOG"
```

Przed startem warto sprawdzić, że kontenery stoją i nic innego nie mierzy:

```bash
docker ps --format '{{.Names}}' | grep -E 'mg_functional|mg_oop|my_postgres'
pgrep -f "k6 run" || echo "brak innego pomiaru — można startować"
```

Podgląd w trakcie:

```bash
tail -f "$LOG"                                    # bieżąca kombinacja i wyjście k6
pgrep -fl "k6 run"                                # co jest właśnie mierzone
pmset -g assertions | grep PreventSystemSleep     # blokada uśpienia aktywna?
pmset -g log | grep "Entering Sleep" | tail -5    # czy maszyna zasnęła w trakcie
ls benchmarks/results/s3_B_functional_*.json | wc -l   # ile powtórzeń już gotowych
```

Jeśli w `pmset -g log` pojawi się uśpienie z okresu pomiaru, wyniki z tego czasu są skażone i trzeba je odrzucić (przenieść poza `benchmarks/results/`) oraz powtórzyć kombinację.

### Metryki zbierane

**k6 (HTTP):** `http_req_duration` avg/p50/p95/p99, `http_req_waiting` (TTFB), `http_reqs` rate (req/s), `http_req_failed` (%), `iterations`.

**docker stats (co 1 s):** `cpu_pct`, `mem_usage` (MB), `mem_pct` (% limitu kontenera).

**`/api/diagnostics` (co 1 s):** `eventLoopLag.mean` i `.p99`, `heap.used` / `.total`, `rss`, `gcPauses.ms`, `gcPauses.count`.

### Pliki wynikowe

```
benchmarks/results/
├── s3_B_functional_1780299554.json              # k6 — metryki HTTP
├── s3_B_oop_1780299554.json
├── s3_B_functional_stats_1780299554.csv         # docker stats podczas pomiaru functional
├── s3_B_functional_diag_func_1780299554.jsonl   # /api/diagnostics aplikacji functional
├── s3_B_functional_diag_oop_1780299554.jsonl    # /api/diagnostics aplikacji bezczynnej
└── ...
```

Format: `<scenariusz>_<profil>_<implementacja>[_<rodzaj>]_<timestamp>.<ext>`. Znacznik czasu jest wspólny dla jednego powtórzenia i to po nim `compare.py` grupuje pliki.

Surowe wyniki są w `.gitignore`. Podkatalogi `discarded/`, `archive_pre_2026-08-24/`, `superseded_s1s2/` i `superseded_full_matrix/` przechowują pomiary odrzucone i zastąpione — ich pliki `README.md` z uzasadnieniem odrzucenia zostają w repozytorium celowo.

---

## Analiza wyników

### Analiza główna

```bash
./benchmarks/run_analysis.sh        # compare.py → benchmarks/reports/benchmark_wyniki.txt
```

albo bezpośrednio:

```bash
python3 benchmarks/analysis/compare.py
python3 benchmarks/analysis/compare.py \
  --results-dir benchmarks/results \
  --output-dir  benchmarks/analysis/charts
```

Parsowanie pełnej serii (~300 GB) trwa kilkadziesiąt minut — `run_analysis.sh` używa `python3 -u`, żeby wyniki pojawiały się na bieżąco, i zapisuje je równolegle do pliku. Przy długiej analizie stosuje się to samo zabezpieczenie, co przy pomiarze (`nohup` + `caffeinate`).

`compare.py` wypisuje dla każdej pary (scenariusz, profil) tabelę porównawczą:

```
S3 / Profile A — Baseline (1 VU, 30s)
┌───────────────────┬────────────┬──────────┬──────────┐
│ Metryka           │ Functional │ OOP      │ Różnica  │
├───────────────────┼────────────┼──────────┼──────────┤
│ avg latency (ms)  │ 5.9        │ 6.8      │ -13.3%   │
│ p95 (ms)          │ 8.2        │ 9.9      │          │
│ req/s             │ 157.3      │ 144.1    │ +9.2%    │
│ error rate (%)    │ 0.00       │ 0.00     │          │
│ avg CPU %         │ 12.3       │ 13.7     │          │
│ avg MEM (MB)      │ 98.4       │ 101.2    │          │
└───────────────────┴────────────┴──────────┴──────────┘
```

a przy `REPEATS` ≥ 2 dodatkowo sekcję **ANALIZA POWTÓRZEŃ**: średnia z powtórzeń, odchylenie standardowe międzyprzebiegowe (`ddof=1`), 95-procentowy przedział ufności z rozkładu t-Studenta i kryterium rozłączności przedziałów.

Wykresy PNG trafiają do `benchmarks/analysis/charts/` (poza gitem):

| Plik | Zawartość |
|------|-----------|
| `<scenariusz>_<profil>_<ts>_latency_throughput.png` | Latencja p95 i przepustowość |
| `<scenariusz>_<profil>_<ts>_resources.png` | Przebieg CPU i RAM w czasie |
| `<scenariusz>_<profil>_<ts>_diagnostics.png` | Opóźnienie pętli zdarzeń, sterta, pauzy GC |
| `<scenariusz>_<profil>_repeats.png` | Rozrzut między powtórzeniami |
| `summary.png` | Zestawienie p95 i req/s dla S1–S6 |

### Normalizacja metryk H5 (pamięć i odśmiecacz)

Liczniki GC z okna pomiaru mieszają dwa efekty: koszt alokacyjny pojedynczego żądania (przedmiot hipotezy H5) i liczbę obsłużonych żądań. Szybsza implementacja wypada „gorzej" tylko dlatego, że wykonała więcej pracy. Skrypt dzieli oba liczniki przez liczbę żądań w tym samym oknie:

```bash
./benchmarks/run_analysis.sh                     # najpierw — tworzy plik źródłowy
python3 benchmarks/analysis/h5_per_request.py \
  > benchmarks/reports/metryki_h5_na_zadanie.txt
```

Skrypt czyta `benchmarks/reports/benchmark_wyniki.txt`, a nie surowy materiał — jest więc szybki, ale wymaga wcześniejszego uruchomienia analizy głównej.

---

## Pozostałe pomiary

### Metryki statyczne kodu (SLOC, złożoność cyklomatyczna)

Pomiar, który nie uruchamia aplikacji — czyta kod obu implementacji i liczy rozmiar, złożoność cyklomatyczną, głębokość zagnieżdżeń oraz liczbę punktów końcowych API:

```bash
npm run metrics:static             # → benchmarks/reports/metryki_statyczne.txt
node benchmarks/static/collect.js  # to samo, na stdout
```

Wynik jest deterministyczny i zależy wyłącznie od zawartości `apps/`, dlatego nagłówek pliku zapisuje commit **ostatniej zmiany w `apps/`**, a nie `HEAD` — liczby da się odtworzyć przez `git checkout <hash> -- apps`. Dane surowe (każdy plik z warstwą, licznikami linii i listą funkcji z ich CC) lądują w `benchmarks/static/out/static_metrics.json`. Metoda, podział na warstwy i ograniczenia miary: `benchmarks/static/README.md`.

### Sondy — mechanizm anomalii S3

Pomiary pomocnicze rozdzielające czas spędzony w aplikacji od czasu spędzonego w serwerze bazy danych (`pg_stat_statements`). Służą wyjaśnieniu, dlaczego w S3 implementacja funkcyjna wypada lepiej:

```bash
./benchmarks/probes/run_probe.sh diag      # trasa bez SQL — czysty koszt organizacji kodu
./benchmarks/probes/run_probe.sh list1     # GET /api/products?limit=1
./benchmarks/probes/run_probe.sh list20    # jak S3
./benchmarks/probes/run_probe.sh list50

VUS=200 DURATION=60s ./benchmarks/probes/run_probe.sh list20   # nadpisanie obciążenia
```

Krzywa przepustowości samego serwera bazy (bez kodu którejkolwiek aplikacji) — `pg_curve.js` używa sterownika `pg`, więc uruchamia się wewnątrz kontenera aplikacji:

```bash
docker cp benchmarks/probes/pg_curve.js mg_oop:/tmp/pg_curve.js
docker exec -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME=postgres \
  -e DB_USER=postgres -e DB_PASSWORD=postgres -e DURATION_MS=10000 \
  mg_oop node /tmp/pg_curve.js

python3 benchmarks/probes/plot_pg_curve.py   # wykres krzywej → analysis/charts/
```

Sonda zeruje globalny licznik `pg_stat_statements` przed każdym oknem pomiaru — **nie uruchamiaj jej równolegle z innym obciążeniem tej instancji PostgreSQL.** Wyniki i wnioski: `benchmarks/probes/README.md`.

---

## Rozwiązywanie problemów

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| `mg_functional` / `mg_oop` w pętli restartów, w logach `getaddrinfo ENOTFOUND postgres` | Nie działa kontener bazy. `docker compose up -d postgres`, potem `docker compose restart app-functional app-oop`. |
| Postgres nie startuje: `superuser password is not specified` | Compose interpoluje `POSTGRES_*` ze środowiska powłoki, nie z `env_file`. Zostaw wartości domyślne albo wyeksportuj `DB_NAME`/`DB_USER`/`DB_PASSWORD` w powłoce. |
| `npm run bench:reset` nie łączy się z bazą | Brak nadpisania adresu: `DB_HOST=localhost DB_PORT=55432 npm run bench:reset`. Z hosta baza jest na porcie **55432**, nie 5432. |
| `reset.ts` odmawia pracy: brak tabel benchmarku | Zabezpieczenie przed czyszczeniem cudzej bazy. Sprawdź, na którą instancję wskazują `DB_HOST`/`DB_PORT`/`DB_NAME` — skrypt wypisuje adres docelowy przed startem. |
| Aplikacja nie odpowiada na `localhost:3000` | W Dockerze implementacja funkcyjna jest pod **3100**; port 3000 dotyczy tylko uruchomienia lokalnego. |
| Pierwszy `docker compose up` długo nie kończy health-checku | Trwa `npm install` + `npm run build` + migracja `009` (910 tys. rekordów). `docker compose logs -f app-functional` pokaże postęp. |
| k6: `connection refused` w trakcie pomiaru | Aplikacja nie zdążyła wstać po restarcie kontenera albo padła na limicie pamięci. `docker compose ps`, `docker logs mg_functional --tail 50`. |
| Przebieg nocny urwał się w środku | Maszyna zasnęła (sprawdź `pmset -g log` pod kątem wpisów „Entering Sleep") albo proces zginął razem z sesją terminala. Uruchamiaj wyłącznie receptą `nohup` + `caffeinate` z sekcji o długim przebiegu i miej otwartą klapę laptopa. |
| `compare.py`: `Brak plików wynikowych` | Zły katalog albo brak kompletnej pary functional+OOP dla danego znacznika czasu — przebiegi bez obu plików są pomijane. |
| Brak miejsca na dysku w trakcie macierzy | Pełna seria to ok. 300 GB surowych JSON-ów. Zwolnij miejsce albo mierz węższy zakres (`PROFILES="A B"`). |

---

## Pytania badawcze i hipotezy

### Pytania badawcze

1. Czy architektura FCIS z `fp-ts` ma mierzalny narzut wydajnościowy względem klasycznego OOP?
2. Przy jakiej skali obciążenia (VU) różnice stają się istotne?
3. Które operacje są najbardziej wrażliwe na wybór sposobu organizacji kodu?
4. Jak różni się wzorzec alokacji pamięci? (`fp-ts` tworzy wiele małych obiektów `Either`/`Task`/`Reader`)

### Hipotezy

| ID | Hipoteza | Uzasadnienie |
|----|---------|-------------|
| **H1** | S1/S2 (bcrypt) — identyczna wydajność | bcrypt dominuje czas odpowiedzi, narzut architektury jest pomijalny |
| **H2** | S3/S4 (odczyty) — functional nieznacznie wolniejszy | fp-ts alokuje więcej małych obiektów → większe ciśnienie GC |
| **H3** | Profil D — różnica rośnie | Pauzy GC częstsze przy wyższej liczbie alokacji |
| **H4** | S6 (placeOrder) — największa różnica strukturalna | Łańcuch RTE tworzy więcej domknięć niż liniowy async/await |
| **H5** | Zużycie pamięci wyższe w functional | Stałe alokacje `Either`/`Task`/`Option`/`Reader` na stercie |

### Ograniczenia metodologiczne

- Pomiar na jednej maszynie i jednej parze implementacji — wyniki są powtarzalne **względnie**, nie absolutnie, i nie uogólniają się na paradygmaty.
- Wspólna instancja PostgreSQL przy wysokim obciążeniu sama staje się wąskim gardłem — to nie artefakt, tylko zjawisko, które trzeba rozdzielić od kosztu kodu (stąd sondy w `benchmarks/probes/`).
- Node.js jest jednowątkowy, a operacje CPU-bound (bcrypt) maskują różnice architektoniczne.
- Kompilacja JIT w V8 faworyzuje kod już rozgrzany — stąd obowiązkowa faza `WARMUP` przed każdym oknem pomiaru.

---

## Szybki start (TL;DR)

```bash
# Instalacja i konfiguracja
npm install
cp apps/functional/.env.example apps/functional/.env
cp apps/oop/.env.example        apps/oop/.env

# Aplikacje (pierwszy start kilka minut — seed 910 tys. rekordów)
docker compose up -d
curl -s http://localhost:3100/ && curl -s http://localhost:3001/

# Testy (nie wymagają bazy)
npm test

# Jeden pomiar
./benchmarks/run_single.sh s3 A

# Pełna macierz pracy (~14 h, ok. 300 GB) — patrz sekcja o długim przebiegu
REPEATS=3 ./benchmarks/run_all.sh

# Analiza
./benchmarks/run_analysis.sh        # → benchmarks/reports/benchmark_wyniki.txt
npm run metrics:static              # → benchmarks/reports/metryki_statyczne.txt
```
