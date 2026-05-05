# Project Memory

## Purpose
This project is part of a **master's thesis** comparing purely functional vs object-oriented approaches and the **performance differences** between the two implementations.

- This repo = monorepo: `apps/functional/` (port 3000) + `apps/oop/` (port 3001)
- Performance benchmarking between the two is a key goal
- Full spec: `docs/PRD.md`, benchmark methodology: `docs/BENCHMARK.md`

## Key Context
- Language used with user: Polish
- Stack: TypeScript, Express.js, fp-ts (functional only), PostgreSQL, Zod, bcrypt, JWT
- Architecture: functional = FCIS + ReaderTaskEither; OOP = Controller → Service → Repository
- Shared SQL migrations: `database/migrations/` (both apps reference this folder)
- Shared HTTP request files: `requests/<feature>.http`

## Workflow Rules
See `memory/feedback_workflow.md`:
- Run linter after each work session (both apps)
- Commit after each phase/feature, no Co-Authored-By line
- Add `.http` request block for every new endpoint

## Aktualny plan prac
Szczegóły w `memory/ecommerce-plan.md`:
- ✅ Faza 0 — bugi naprawione (login zwraca token, usunięto client_number, martwy kod)
- ✅ Faza 1 — JWT Middleware (functional + OOP)
- ✅ OOP bootstrap — UserService, UserRepository, UserController, healthcheck route
- ✅ Docker — oba kontenery healthy (functional:3000, OOP:3001), postgres:5432
- **Następny: Faza 2 — Kategorie** (migration, GET /api/categories, POST /api/categories)

## Links to detail files
- See CLAUDE.md for architecture overview and commands
- See memory/ecommerce-plan.md for full e-commerce implementation plan
- See memory/feedback_workflow.md for workflow rules
