# BENCHMARK.md — Metodologia badań wydajnościowych

## 1. Pytania badawcze

1. Czy architektura FCIS z fp-ts ma mierzalny narzut wydajnościowy w porównaniu do klasycznego OOP?
2. Przy jakiej skali obciążenia różnice stają się istotne (jeśli w ogóle)?
3. Które operacje są najbardziej wrażliwe na wybór architektury: proste odczyty, operacje z kryptografią (bcrypt), złożone transakcje (placeOrder)?
4. Jak wzorzec alokacji pamięci różni się między implementacjami (GC pressure — fp-ts tworzy wiele małych obiektów Either/Task)?

---

## 2. Środowisko testowe

### Infrastruktura

```yaml
# docker-compose — środowisko benchmarku
services:
  postgres:        # wspólna baza dla obu apek
    image: postgres:15
    cpus: 2
    memory: 1g

  app-functional:
    image: node:18
    port: 3000
    cpus: 1        # identyczne limity dla obu
    memory: 512m

  app-oop:
    image: node:18
    port: 3001
    cpus: 1
    memory: 512m
```

**Zasady środowiska:**
- Oba serwisy uruchomione jednocześnie, na tej samej maszynie
- Identyczne limity CPU i RAM w kontenerach Docker
- Ta sama instancja PostgreSQL (eliminuje zmienność DB)
- Baza danych seedowana tymi samymi danymi przed każdym scenariuszem
- Benchmark uruchamiany przez k6 z zewnątrz kontenerów (localhost)

### Wymagania sprzętowe (minimalne dla powtarzalnych wyników)
- CPU: 4 rdzenie (2 dla apek, 2 dla PostgreSQL + k6)
- RAM: 8 GB
- Dysk: SSD (latencja I/O wpływa na PostgreSQL)
- Sieć: localhost (eliminuje zmienność sieciową)

---

## 3. Narzędzia

| Narzędzie | Zastosowanie |
|-----------|-------------|
| **k6** | Testy obciążeniowe — skrypty JS, metryki p95/p99 |
| **docker stats** | Zużycie CPU i RAM kontenerów w czasie rzeczywistym |
| **k6 Prometheus remote write** | Streaming metryk do analizy (opcjonalne) |
| **Python (pandas + matplotlib)** | Analiza wyników CSV, wykresy do pracy |

---

## 4. Metryki

### HTTP (k6 — automatyczne)
| Metryka | Opis |
|---------|------|
| `http_req_duration` (avg, p50, p95, p99) | Czas odpowiedzi |
| `http_reqs` (total, rate) | Przepustowość (req/s) |
| `http_req_failed` | Procent błędów |
| `http_req_waiting` | Czas TTFB (Time To First Byte) |
| `iterations` | Liczba wykonanych iteracji scenariusza |

### Zasoby systemowe (docker stats — co 1s)
| Metryka | Opis |
|---------|------|
| CPU % | Zużycie procesora kontenera |
| MEM usage / limit | Zużycie pamięci |
| MEM % | Procent limitu |

---

## 5. Scenariusze testowe

Każdy scenariusz testuje **jeden endpoint** izolowanie — pozwala przypisać różnicę do konkretnej operacji.

### S1 — Rejestracja użytkownika (POST /api/users/register)
**Charakterystyka:** zapis do DB + bcrypt hash (CPU-intensive)
```javascript
// k6: każda iteracja = unikalny email
const payload = { name: 'Test', surname: 'User', email: `user${__VU}_${__ITER}@test.com`, password: 'Password1' };
```
**Hipoteza:** bcrypt dominuje czas — minimalna różnica między implementacjami.

### S2 — Logowanie (POST /api/auth/login)
**Charakterystyka:** odczyt z DB + bcrypt compare + podpisanie JWT
```javascript
// k6: ten sam użytkownik, wiele równoległych loginów
const payload = { email: 'bench@test.com', password: 'Password1' };
```
**Hipoteza:** bcrypt compare dominuje — minimalna różnica.

### S3 — Lista produktów (GET /api/products)
**Charakterystyka:** czysty odczyt, brak kryptografii
```javascript
// k6: zapytanie z filtrowaniem
const url = `${BASE_URL}/api/products?page=1&limit=20`;
```
**Hipoteza:** tu mogą wyjść różnice — fp-ts chain vs bezpośredni async/await. Mała latencja bazy → narzut architektury bardziej widoczny.

### S4 — Szczegóły produktu (GET /api/products/:id)
**Charakterystyka:** odczyt po PK — najszybsza operacja
**Hipoteza:** najlepsza szansa na ujawnienie narzutu fp-ts (operacja tak szybka, że overhead jest proporcjonalnie większy).

### S5 — Dodanie do koszyka (POST /api/cart/items) — wymaga auth
**Charakterystyka:** JWT verify + odczyt + walidacja stocku + zapis
**Hipoteza:** złożona logika — może wyjść różnica w zarządzaniu efektami.

### S6 — Złożenie zamówienia (POST /api/orders) — wymaga auth
**Charakterystyka:** JWT verify + pełna transakcja PostgreSQL (wiele odczytów + wiele zapisów atomowo)
**Hipoteza:** najważniejszy scenariusz — złożona logika biznesowa. Porównanie RTE chain vs async/await + try/catch.

---

## 6. Profile obciążenia

Każdy scenariusz uruchamiany z trzema profilami:

### Profil A — Baseline
```javascript
export const options = {
  vus: 1,
  duration: '30s',
};
```
Cel: zmierzyć latencję bez rywalizacji — czysta różnica architektur.

### Profil B — Normalne obciążenie
```javascript
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up
    { duration: '2m',  target: 20 },   // plateau
    { duration: '30s', target: 0 },    // ramp down
  ],
};
```
Cel: realistyczne obciążenie — 20 równoległych użytkowników.

### Profil C — Obciążenie szczytowe
```javascript
export const options = {
  stages: [
    { duration: '1m',  target: 100 },
    { duration: '3m',  target: 100 },
    { duration: '1m',  target: 0 },
  ],
};
```
Cel: czy event loop Node.js zachowuje się inaczej pod dużym obciążeniem?

### Profil D — Stress test (ramp-up do limitu)
```javascript
export const options = {
  stages: [
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed:            ['rate < 0.01'],
    'http_req_duration{p(95)}': ['< 500'],
  },
};
```
Cel: znaleźć punkt, w którym jedna implementacja degraduje szybciej.

---

## 7. Struktura plików benchmarku

```
benchmarks/
  k6/
    scenarios/
      s1_register.js
      s2_login.js
      s3_products_list.js
      s4_product_detail.js
      s5_add_to_cart.js
      s6_place_order.js
    helpers/
      auth.js          ← helper: login i zwrot tokenu
      seed.js          ← seeding danych przed testem (przez API lub SQL)
    run_all.sh         ← uruchamia wszystkie scenariusze sekwencyjnie
  results/
    <scenariusz>_<profil>_functional_<timestamp>.json
    <scenariusz>_<profil>_oop_<timestamp>.json
  analysis/
    compare.py         ← skrypt Python do analizy i generowania wykresów
    charts/            ← wygenerowane wykresy (PNG)
```

---

## 8. Procedura wykonania benchmarku

```bash
# 1. Uruchom środowisko
docker compose up -d

# 2. Zaseeduj bazę danych
node benchmarks/k6/helpers/seed.js

# 3. Uruchom benchmark dla scenariusza (np. S3, profil B)
k6 run \
  -e BASE_URL_FUNC=http://localhost:3000 \
  -e BASE_URL_OOP=http://localhost:3001 \
  --out json=benchmarks/results/s3_profileB_functional_$(date +%s).json \
  benchmarks/k6/scenarios/s3_products_list.js

# 4. Zbierz metryki zasobów podczas testu
docker stats --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" \
  mg_functional mg_oop >> benchmarks/results/docker_stats_$(date +%s).csv &

# 5. Uruchom analizę
python3 benchmarks/analysis/compare.py
```

---

## 9. Format wyników i analiza

### Tabela porównawcza (na każdy scenariusz)
| Metryka | Functional | OOP | Różnica |
|---------|-----------|-----|---------|
| avg latency (ms) | | | |
| p50 (ms) | | | |
| p95 (ms) | | | |
| p99 (ms) | | | |
| req/s | | | |
| error rate (%) | | | |
| avg CPU % | | | |
| avg MEM (MB) | | | |

### Wykresy (generowane przez `compare.py`)
1. Latencja p95 — wszystkie scenariusze, obie implementacje (grouped bar chart)
2. Przepustowość req/s — wszystkie scenariusze (grouped bar chart)
3. Latencja w czasie — profil D (stress test), linia ciągła
4. Zużycie CPU w czasie — profil C, obie implementacje
5. Zużycie pamięci w czasie — profil C, obie implementacje

---

## 10. Hipotezy badawcze

| # | Hipoteza | Uzasadnienie |
|---|---------|-------------|
| H1 | Dla operacji CPU-bound (bcrypt) obie implementacje będą identyczne | bcrypt dominuje czas, overhead architektury jest pomijalny |
| H2 | Dla odczytów (S3, S4) functional może być nieznacznie wolniejszy | fp-ts alokuje więcej małych obiektów → większe ciśnienie GC |
| H3 | Pod dużym obciążeniem (profil D) różnica może wzrosnąć | GC pauses w V8 mogą być częstsze przy większej liczbie alokacji fp-ts |
| H4 | `placeOrder` (S6) pokaże największą różnicę strukturalną | Złożona logika — RTE chain tworzy więcej closures vs liniowy async/await |
| H5 | Zużycie pamięci będzie wyższe w functional | Stałe alokacje Either/Task/Option/Reader — więcej obiektów na stercie |

---

## 11. Ograniczenia metodologiczne

- Benchmark na jednej maszynie — wyniki są powtarzalne względnie, nie absolutnie
- Node.js jest jednowątkowy — CPU-bound operacje (bcrypt) mogą maskować różnice architektoniczne
- JIT kompilacja V8 może faworyzować jeden wzorzec po rozgrzaniu — uwzględnić warmup
- Współdzielona baza danych — przy dużym obciążeniu może stać się wąskim gardłem dla obu implementacji
