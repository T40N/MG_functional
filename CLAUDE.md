# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

This is a **monorepo** for a master's thesis comparing functional and OOP approaches in TypeScript/Express.js, including performance benchmarks between both implementations.

- `apps/functional/` — functional implementation (fp-ts, ReaderTaskEither, FCIS architecture)
- `apps/oop/` — OOP implementation (in development) — same API, same DB, class-based architecture
- Both apps connect to the same PostgreSQL instance

## Commands

### From root (monorepo)
```bash
npm run dev:functional      # Start functional app in dev mode
npm run dev:oop             # Start OOP app in dev mode
npm run test:functional     # Run functional tests
npm run test:oop            # Run OOP tests
npm run test                # Run all tests (both apps)
npm run build:functional
npm run build:oop
npm run lint                # Lint all workspaces
docker compose up           # Start PostgreSQL + functional app (OOP commented out in docker-compose.yml)
```

### From within apps/functional/ (or apps/oop/)
```bash
npm run dev                 # ts-node-dev with tsconfig-paths
npm run build               # tsc -p tsconfig.build.json && tsc-alias (resolves path aliases in dist/)
npm test                    # Jest
npm test -- --testPathPattern="createUser"   # Single test file
npm test -- --testNamePattern="returns user" # Single test by name
npm run lint
npm run lint:fix
```

## Architecture (apps/functional/)

Uses **Functional Core, Imperative Shell (FCIS)** with `fp-ts`.

### Directory structure

```
src/
  common/           # Shared across features
    core/           # Pure functions (no side effects)
      usecases/     # createResponse, validate, get_messages, eventBus
      types/        # TAppEvent
    shell/          # Side effects
      database.ts   # pg Pool, migrations runner
      server.ts     # Express app setup, route registration
      migrations/   # SQL files run at startup in alphabetical order
  users/            # Users feature module
    core/
      usecases/     # createUser.ts, loginUser.ts (pure use cases)
      types/        # TDbUser, TPublicUser, TUserToSave, TCreateUserEnv/Result, TLoginEnv/Result
      effects/      # Effect type definitions
    shell/
      routes/       # registerUser.ts, loginUser.ts (Express handlers)
      db/           # saveUser.ts, getUserByEmail.ts (pg queries)
      validation/   # Zod schemas for DTOs
      factories/    # userFactory.ts (DTO → domain input)
      dtos/         # TCreateUserDto, TLoginDto type declarations
__tests__/
  users/            # Unit tests for use cases, integration tests for routes
  server.test.ts
  database.test.ts
```

### Path aliases

`@common/*` → `src/common/*`, `@users/*` → `src/users/*`. Resolved by:
- `tsconfig-paths` at runtime (`npm run dev`)
- `tsc-alias` after build (`npm run build`)
- `moduleNameMapper` in `jest.config.js` for tests

### Use case pattern (ReaderTaskEither)

Use cases in `core/usecases/` are `ReaderTaskEither<TEnv, Error, TResult>`. The `TEnv` type declares what effects the use case needs (`getUserByEmail`, `hashPassword`, `saveUser`, `createToken`). This makes them pure and trivially testable without mocks.

Shell routes construct the concrete `env` object (wiring real DB/bcrypt/JWT implementations) and call `useCase(input)(env)()`.

```typescript
// Core (pure)
export const createUser = (input: TCreateUserInput): RTE.ReaderTaskEither<TCreateUserEnv, Error, TCreateUserResult> => ...

// Shell (impure)
const env: TCreateUserEnv = {
  getUserByEmail: (email) => getUserByEmail(pool, email),
  hashPassword: (pw) => TE.tryCatch(() => bcrypt.hash(pw, 10), ...),
};
const result = await createUser(userInput)(env)();
```

### API response shape

All endpoints use `createResponse` from `@common/core/usecases/createResponse`:
- Success: `{ success: true, data: T, message: string }`
- Error: `{ success: false, error: { type: string, details?: unknown }, message: string }`

### Database

- PostgreSQL via `pg` Pool, stored on `app.dbPool` (Express app extended type in `src/index.ts`)
- SQL migrations in `src/common/shell/migrations/` run automatically at startup (sorted alphabetically)
- Env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `PORT`
