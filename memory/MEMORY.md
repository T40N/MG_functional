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

## Aktualny stan (2026-06-01)
Wszystkie fazy e-commerce + platforma benchmarkowa B1–B6 ukończone.
- ✅ Fazy 0–5: API e-commerce (users, categories, products, cart, orders)
- ✅ B1–B5: infrastruktura benchmark, diagnostics endpoint, seed 910k rekordów, k6 S1–S6, orkiestracja
- ✅ B6: `benchmarks/analysis/compare.py` — parsuje k6 JSONL + docker stats CSV + diagnostics JSONL, generuje wykresy PNG
- **Następny: uruchomić S1–S6 profil A/B (brakuje wyników), potem analiza Python**
- Pierwsze wyniki S3/A: functional 157 req/s vs OOP 144 req/s (functional szybszy o 9.4%)

## Links to detail files
- See CLAUDE.md for architecture overview and commands
- See memory/ecommerce-plan.md for full e-commerce implementation plan
- See memory/feedback_workflow.md for workflow rules
