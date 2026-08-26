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
| `http_req_duration` — **SD i CV** | **Odchylenie standardowe i współczynnik zmienności czasu żądania** (wymóg promotora) |
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

### Pamięć i odśmiecacz (`/api/diagnostics` — pomiar wewnątrz procesu Node)
| Metryka | Opis |
|---------|------|
| `heapUsedMb`, `heapTotalMb`, `rssMb` | Zajętość sterty V8 i całkowity ślad procesu |
| `gc.count`, `gc.totalPauseMs` | Liczba zdarzeń odśmiecania i suma pauz w oknie pomiarowym |
| `eventLoop.lagMeanMs`, `lagP99Ms` | Opóźnienie pętli zdarzeń — skutek pauz GC widoczny dla klienta |

To podstawa dowodowa **hipotezy H5**; sposób agregacji opisuje sekcja 6b.

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

## 6a. Powtórzenia pomiarów i odchylenie standardowe

**Wymóg dodatkowy (ustalenie z promotorem, 2026-08-24):** badanie ma raportować
**średni czas żądania wraz z odchyleniem standardowym**.

### Dwa różne odchylenia standardowe

Rozróżnienie jest istotne merytorycznie — zmieszanie tych dwóch wielkości jest
najczęstszym błędem w raportowaniu benchmarków:

| | Co opisuje | Skąd |
|---|---|---|
| **SD wewnątrzprzebiegowa** | rozrzut czasów pojedynczych żądań w obrębie jednego przebiegu — zmienność, jakiej doświadcza klient | wszystkie próbki `http_req_duration` z jednego pliku k6 |
| **SD międzyprzebiegowa** | rozrzut średnich z niezależnych powtórzeń tego samego pomiaru — powtarzalność eksperymentu | średnie z N przebiegów tej samej pary (scenariusz, profil) |

Tylko **SD międzyprzebiegowa** pozwala stwierdzić, czy różnica między
implementacjami nie jest szumem pomiarowym. SD wewnątrzprzebiegowa opisuje
charakterystykę systemu, nie jakość pomiaru.

### Liczba powtórzeń

Minimum **3 powtórzenia** na każdą parę (scenariusz, profil), zalecane 5.
Uzasadnienie: Georges, Buytaert, Eeckhout (OOPSLA 2007, DOI 10.1145/1297027.1297033)
oraz Kalibera, Jones (ISMM 2013, DOI 10.1145/2464157.2464160) — pojedynczy
przebieg na maszynie z kompilacją JIT i odśmiecaniem pamięci nie uprawnia
do wniosku o różnicy wydajności.

Dodatkowo punkt 3.2c *Regulaminu prac dyplomowych WFiIS UŁ* wymaga od pracy
magisterskiej wykazania się umiejętnością zastosowania metod naukowych — co
w badaniu pomiarowym czyni powtórzenia wymogiem formalnym, nie tylko dobrą praktyką.

### Kryterium istotności różnic

Dla każdej pary implementacji wyznaczany jest **95% przedział ufności** średniej,
na podstawie rozkładu t-Studenta (n < 30). Kryterium:

- **przedziały rozłączne** → różnica istotna statystycznie na poziomie 0,05;
- **przedziały nachodzące** → różnica **nierozstrzygnięta**.

**Uwaga na sformułowanie.** Nachodzące przedziały to *brak dowodu różnicy*,
a nie *dowód jej braku*. Przy n = 3 moc testu jest niska, więc różnica realna,
ale mała, pozostanie niewykryta. Raporty nie mówią więc „różnica nieistotna
statystycznie" (co sugerowałoby wniosek mocniejszy, niż dane pozwalają
wyciągnąć), tylko „nierozstrzygnięta", z przypisem wyjaśniającym. Dotyczy to
zarówno tabeli `POWTÓRZENIA`, jak i tabel H5 z sekcji 6b.

Metoda rozłączności przedziałów ufności jest wprost zalecana przez Georges i in.
Nie stosujemy testu t-Studenta na wartościach p, bo przy n = 3–5 przedziały
ufności są czytelniejsze i trudniejsze do nadinterpretacji.

### Uruchomienie

```bash
# 5 niezależnych powtórzeń jednego scenariusza i profilu
REPEATS=5 ./benchmarks/run_single.sh s3 B

# 3 powtórzenia całej macierzy (uwaga: ~10–12 h)
REPEATS=3 ./benchmarks/run_all.sh

# Analiza — sekcja "ANALIZA POWTÓRZEŃ" pojawia się automatycznie
python3 benchmarks/analysis/compare.py
```

Każde powtórzenie otrzymuje własny znacznik czasu i własny reset bazy danych,
więc `compare.py` traktuje je jako niezależne przebiegi i grupuje po parze
(scenariusz, profil).

### Artefakty analizy

| Plik | Zawartość |
|---|---|
| `<scen>_<profil>_repeats.png` | średnia ± SD i ± 95% CI oraz rozrzut średnich poszczególnych przebiegów |
| `summary_mean_sd.png` | zbiorczy średni czas żądania ± SD dla wszystkich pomiarów |
| tabela `POWTÓRZENIA` w konsoli | n, średnia, SD międzyprzebiegowa, CV, granice CI, SD wewnątrzprzebiegowa, wniosek o istotności |

---

## 6b. Agregacja metryk hipotezy H5 (pamięć i odśmiecacz)

**H5 jest hipotezą centralną pracy** — tytuł („wpływ czysto funkcyjnych struktur
danych na efektywność") kieruje uwagę wprost na koszt zasobowy niemutowalności.
Do 2026-08-26 sekcja „ANALIZA POWTÓRZEŃ" agregowała jednak wyłącznie czas
żądania, przez co hipoteza centralna była jedyną, dla której nie liczono
rozrzutu: raportowano pojedynczą liczbę z jednego przebiegu. Zostało to
naprawione — metryki pamięciowo-odśmiecające przechodzą teraz **dokładnie tę samą
procedurę statystyczną** co czas żądania (wspólna funkcja `aggregate_values()`).

### Agregowane metryki

| Metryka | Źródło | Znaczenie dla H5 |
|---|---|---|
| Sterta użyta — średnia i maksimum (MB) | `/api/diagnostics` (wewnątrz procesu) | bezpośrednia miara ciśnienia alokacyjnego |
| RSS — średnia (MB) | `/api/diagnostics` | całkowity ślad pamięciowy procesu |
| Zdarzenia GC (liczba) | `/api/diagnostics` | jak często odśmiecacz musi działać |
| Suma pauz GC (ms) | `/api/diagnostics` | ile czasu procesor traci na odśmiecanie |
| Opóźnienie pętli zdarzeń — średnia i p99 (ms) | `/api/diagnostics` | skutek pauz GC widoczny dla klienta |
| CPU — średnia (%) | `docker stats` | koszt obliczeniowy poza pomiarem wewnętrznym |
| Pamięć kontenera — średnia i maksimum (MiB) | `docker stats` | kontrola zewnętrzna wobec pomiaru V8 |

Liczniki GC są kumulatywne od startu procesu, ale `run_single.sh` zeruje je
(`POST /api/diagnostics/reset`) tuż po rozgrzewce, więc wartości obejmują
wyłącznie okno pomiarowe.

Wszystkie metryki H5 są typu **„mniej znaczy lepiej"**, więc dodatnia Δ oznacza
większe zużycie po stronie funkcyjnej — czyli wynik **zgodny** z H5.

### Metoda

Identyczna jak dla czasu żądania (sekcja 6a): średnia z N powtórzeń,
SD międzyprzebiegowa (`ddof=1`), CV, 95% przedział ufności z rozkładu
t-Studenta, kryterium rozłączności przedziałów.

Metryka, dla której brakuje kompletu próbek, jest **pomijana, a nie zerowana** —
brak pomiaru nie jest pomiarem równym zeru. Serie diagnostyczne zbierane są
niezależnie od plików k6, więc niekompletność jednego źródła nie psuje drugiego.

### Sformułowanie wniosku

Rozstrzygnięcie ma trzy stany, nie dwa:

- **istotna (F>O)** / **istotna (F<O)** — przedziały ufności rozłączne;
- **nierozstrzygnięte** — przedziały nachodzą. To **brak dowodu różnicy, a nie
  dowód jej braku**; przy n = 3 moc testu jest niska, więc różnica realna,
  ale mała, pozostanie niewykryta.

### Artefakty analizy

| Plik | Zawartość |
|---|---|
| tabela `H5 — PAMIĘĆ I ODŚMIECACZ` w konsoli | dla pary (scenariusz, profil): średnia ± SD, Δ%, rozstrzygnięcie dla 10 metryk |
| tabela `H5 — ZESTAWIENIE ZBIORCZE` w konsoli | dla każdej metryki: ile z 24 kombinacji wypadło zgodnie z H5, przeciwnie, nierozstrzygnięcie |
| `<scen>_<profil>_h5_repeats.png` | 6 paneli (sterta śr./maks, RSS, zdarzenia GC, pauzy GC, opóźnienie pętli p99) ze słupkami błędu SD i 95% CI |
| `summary_h5_heap.png`, `summary_h5_gc_count.png`, `summary_h5_gc_pause.png` | zbiorcze porównanie wszystkich pomiarów |
| `h5_aggregates.csv` | pełne liczby (n, średnia, SD, CV, granice CI, Δ%, flaga rozłączności) — materiał źródłowy dla tabel w rozdziale 10 |

---

## 6c. Badanie mechanizmu anomalii S3

Scenariusz S3 (`GET /api/products`) jest jedynym, w którym implementacja funkcyjna
wypada istotnie **lepiej**, i to na wszystkich profilach obciążenia (−10,6% /
−13,4% / −15,4% czasu żądania przy 20 / 100 / 200 VU). Wynik przeciwny do hipotez
H2–H4 nie może zostać w pracy bez wyjaśnienia mechanizmu, a macierz główna go nie
dostarcza: mierzy całą ścieżkę żądania naraz, więc nie rozdziela kosztu aplikacji
od kosztu bazy danych.

Do rozdzielenia warstw służy `benchmarks/probes/` — pomiary pomocnicze,
**nie element macierzy pomiarowej**. Pełny opis eksperymentu, wszystkie liczby
i ograniczenia: `benchmarks/probes/README.md`.

### Trzy pomiary rozdzielające warstwy

| Sonda | Co mierzy | Narzędzie |
|---|---|---|
| `run_probe.sh diag` | warstwę HTTP i kod aplikacji **bez udziału bazy** (`GET /api/diagnostics`, trasa niemal identyczna w obu implementacjach) | k6 |
| `run_probe.sh list{1,20,50}` | realne zapytanie S3, z rozdzieleniem czasu aplikacji i czasu **w bazie** | k6 + `pg_stat_statements` |
| `pg_curve.js` | przepustowość samego serwera bazy wobec liczby równoległych zapytań, **bez kodu aplikacji** | sterownik `pg` |

Kluczowe jest źródło trzecie, którego nie ma w `run_single.sh`:
**`pg_stat_statements`**. Zapytanie S3 jest w obu implementacjach identyczne co do
znaku (sekcja 8.2 w dokumencie przekazania), więc obie trafiają w ten sam wpis
licznika — a ponieważ obciążana jest zawsze tylko jedna aplikacja, licznik zerowany
przed oknem pomiaru przypisuje czas jednoznacznie. Pozwala to policzyć z prawa
Little'a średnią liczbę zapytań wykonywanych w bazie jednocześnie
(`wywołania/s × średni czas zapytania`).

### Ustalony mechanizm

Anomalia S3 **nie jest przewagą paradygmatu**. Zapytanie S3 jest w całości
procesorowe (bitmapowy odczyt ~5000 wierszy kategorii, sortowanie top-N, wszystko
z `shared buffers`, zero wejścia-wyjścia), a kontener Postgresa ma limit 2 rdzeni.
Krzywa przepustowości bazy ma kolano przy **N ≈ 3** równoległych zapytaniach
i dalej **opada** — przy N = 10 baza obsługuje mniej zapytań na sekundę niż przy
N = 2. Obie aplikacje pracują na opadającej gałęzi, implementacja obiektowa dalej
w prawo (7,0 wobec 4,7 zajętych backendów), bo jej tańsza ścieżka na żądanie
wypycha zapytania szybciej. Narzut implementacji funkcyjnej działa tu jako
niezamierzone ograniczenie dopływu zapytań, a mniejsza równoległość oznacza
w tym obszarze **większą** przepustowość.

Narzut funkcyjny w S3 nie zniknął — jest tylko niewidoczny za wąskim gardłem.
Ta sama sonda bez bazy danych pokazuje go wprost: **−22,4% przepustowości**
i +28,9% czasu żądania po stronie funkcyjnej, czyli kierunek zgodny z H2–H4.

Predykcja mechanizmu potwierdzona archiwalnymi danymi: poniżej kolana krzywej
znak różnicy musi się odwrócić — i w profilu A (1 VU, równoległość bazy = 1)
implementacja funkcyjna jest **wolniejsza** (+7,2% czasu żądania, −6,5%
przepustowości).

**Wniosek dla rozdziału 10:** znak różnicy między implementacjami jest funkcją
tego, który element systemu jest wysycony, a nie samego paradygmatu. S3 nie jest
kontrprzykładem wobec H2–H4, jest przykładem przesunięcia wąskiego gardła —
i pokazuje granicę stosowalności całego pomiaru: mierzy koszt paradygmatu tylko
tam, gdzie aplikacja jest wąskim gardłem.

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
  probes/              ← pomiary pomocnicze: mechanizm anomalii S3 (sekcja 6c)
    probe.js           ← sonda k6: warstwa aplikacji osobno od bazy
    run_probe.sh       ← jedna konfiguracja sondy dla obu implementacji
    pg_curve.js        ← krzywa przepustowości bazy wobec równoległości
    README.md          ← opis eksperymentu, wyniki, wnioski
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
| **SD latency (ms)** | | | |
| **CV latency (%)** | | | |
| p50 (ms) | | | |
| p95 (ms) | | | |
| p99 (ms) | | | |
| req/s | | | |
| error rate (%) | | | |
| avg CPU % | | | |
| avg MEM (MB) | | | |

### Tabela powtórzeń (na każdą parę scenariusz × profil)
| Metryka | Functional | OOP | Różnica |
|---------|-----------|-----|---------|
| liczba przebiegów (n) | | | |
| średni czas żądania (ms) | | | |
| SD międzyprzebiegowa (ms) | | | |
| CV międzyprzebiegowe (%) | | | |
| 95% CI dolna (ms) | | | |
| 95% CI górna (ms) | | | |
| SD wewnątrzprzebiegowa (ms) | | | |
| wniosek o istotności | | | |

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
- Współdzielona baza danych — przy dużym obciążeniu może stać się wąskim gardłem dla obu
  implementacji. **W S3 tak się stało** (sekcja 6c): powyżej ~3 równoległych zapytań
  przepustowość Postgresa ograniczonego do 2 rdzeni opada, więc pomiar przestaje mierzyć
  koszt paradygmatu, a zaczyna mierzyć, która implementacja mniej przeciąża bazę. Znak
  różnicy odwraca się wtedy na korzyść implementacji **droższej** na żądanie. Pomiar mówi
  o koszcie paradygmatu tylko tam, gdzie wąskim gardłem jest aplikacja — to ograniczenie
  dotyczy każdego porównania architektur prowadzonego przez pełny stos aplikacyjny
- Powtórzenia wykonywane sekwencyjnie na tej samej maszynie — nie eliminują dryfu warunków w czasie (temperatura CPU, procesy tła). SD międzyprzebiegowa mierzy skutek tego dryfu, ale go nie usuwa
- Kryterium rozłączności przedziałów ufności jest bardziej konserwatywne niż test t-Studenta — przy małym n może nie wykryć różnic realnie istniejących, ale małych
