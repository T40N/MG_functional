# Project Memory

## Purpose
This project is part of a **master's thesis** comparing purely functional vs object-oriented approaches and the **performance differences** between the two implementations.

- This repo = **functional implementation** (fp-ts, ReaderTaskEither, FCIS architecture)
- There is likely a companion OOP project for comparison
- Performance benchmarking between the two is a key goal

## Repo structure
Monorepo with npm workspaces:
- `apps/functional/` — functional implementation (current)
- `apps/oop/` — OOP implementation (to be created)
- Root scripts: `npm run dev:functional`, `npm run test:functional`, etc.

## Key Context
- Language used with user: Polish
- Stack: TypeScript, Express.js, fp-ts, PostgreSQL, Zod, bcrypt, JWT
- Architecture pattern: Functional Core, Imperative Shell (FCIS)
- Use cases use ReaderTaskEither for pure dependency injection

## Aktualny plan prac
Szczegóły w `memory/ecommerce-plan.md`:
- Domena: sklep internetowy
- Kolejność: Faza 0 (bugi) → JWT middleware → Kategorie → Produkty → Koszyk → Zamówienia
- **Następny krok: Faza 0 — naprawa bugów** (client_number, login bez tokenu, martwy kod)

## Links to detail files
- See CLAUDE.md for architecture overview and commands
- See memory/ecommerce-plan.md for full e-commerce implementation plan
