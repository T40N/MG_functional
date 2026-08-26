# Sondy — mechanizm anomalii S3

Katalog zawiera pomiary pomocnicze, których zadaniem nie jest porównanie
implementacji, a **wyjaśnienie jednego wyniku z macierzy głównej**: scenariusz S3
(`GET /api/products`) jest jedynym, w którym implementacja funkcyjna wypada
istotnie **lepiej**, i to na wszystkich trzech profilach obciążenia
(−10,6% / −13,4% / −15,4% czasu żądania przy 20 / 100 / 200 VU). Wynik przeciwny
do hipotez H2–H4 i zbyt powtarzalny, żeby złożyć go na szum.

Pomiar wykonany 2026-08-26. Środowisko: to samo, co w macierzy głównej
(`docker-compose.yml`), 100 VU × 45 s na konfigurację, rozgrzewka JIT 15 s
odrzucana, liczniki diagnostyczne i `pg_stat_statements` zerowane przed każdym
oknem pomiaru.

## Wynik

**Anomalia S3 nie jest przewagą paradygmatu funkcyjnego. Jest efektem przesunięcia
wąskiego gardła do serwera bazy danych, który przy tym obciążeniu pracuje na
opadającej gałęzi swojej krzywej przepustowości.** Narzut implementacji funkcyjnej
jest w S3 obecny i mierzalny — działa jednak jako niezamierzone ograniczenie
dopływu zapytań (back-pressure), a mniejsza równoległość oznacza w tym obszarze
**większą** przepustowość bazy.

Cztery niezależne pomiary składają się na ten wniosek.

## Dowód 1 — warstwa aplikacji bez udziału bazy

`GET /api/diagnostics`, trasa w obu implementacjach niemal identyczna (odczyt
liczników i `res.json`), zero zapytań SQL. Mierzy czysty koszt organizacji kodu.

| 100 VU | functional | OOP | Δ |
|---|---|---|---|
| przepustowość (req/s) | 10 219 | 13 169 | **−22,4%** |
| czas żądania — średnia (ms) | 9,77 | 7,58 | **+28,9%** |
| CPU kontenera aplikacji (% z limitu 100%) | 35,2 | 18,6 | +89% |

Bez bazy danych implementacja funkcyjna jest **wolniejsza o ponad jedną piątą** —
w kierunku zgodnym z H2–H4. Narzut istnieje i jest duży; pytanie brzmi, dlaczego
w S3 nie jest widoczny.

## Dowód 2 — rozdzielenie czasu aplikacji i czasu bazy

To samo zapytanie S3 (identyczne co do znaku w obu implementacjach, więc obie
trafiają w ten sam wpis `pg_stat_statements`), mierzone osobno dla każdej
implementacji, bo obciążana jest zawsze tylko jedna.

| 100 VU, `limit=20` | functional | OOP | Δ |
|---|---|---|---|
| przepustowość (req/s) | 1 309 | 1 077 | **+21,5%** |
| czas żądania — średnia (ms) | 76,36 | 92,63 | −17,6% |
| wywołań zapytania w oknie 45 s | 58 980 | 48 642 | +21,3% |
| **średni czas zapytania W BAZIE (ms)** | **3,609** | **6,475** | **−44,3%** |
| średnia liczba zajętych backendów¹ | 4,73 | 7,00 | −32,4% |

¹ z prawa Little'a: `wywołania/s × średni czas zapytania`. Mówi, ile zapytań
wykonuje się w bazie jednocześnie.

Anomalia odtworzona (+21,5% przepustowości po stronie funkcyjnej), ale jej źródło
leży **poza aplikacją**: identyczne zapytanie wykonuje się w bazie danych o 44%
krócej, gdy odpytuje ją implementacja funkcyjna. Różnica bierze się z liczby
zapytań wykonywanych jednocześnie — 4,7 wobec 7,0.

Wzorzec jest stabilny wobec liczby zwracanych wierszy. `LIMIT` jest w zapytaniu
parametrem, więc plan pozostaje generyczny i koszt w bazie prawie nie zależy od
`limit` (sortowane jest ~5000 wierszy kategorii niezależnie od tego, ile z nich
zostanie zwróconych):

| konfiguracja | Δ przepustowości | Δ czasu w bazie | zajęte backendy (F vs O) |
|---|---|---|---|
| `limit=1` | +25,0% | −44,7% | 5,19 vs 7,52 |
| `limit=20` | +21,5% | −44,3% | 4,73 vs 7,00 |
| `limit=50` | +22,4% | −45,9% | 4,41 vs 6,66 |

## Dowód 3 — krzywa przepustowości bazy danych

`pg_curve.js` wykonuje to samo zapytanie z N równoległymi klientami, **bez kodu
którejkolwiek aplikacji**. Kontener Postgresa ma limit 2 rdzeni, a zapytanie jest
w całości procesorowe: bitmapowy odczyt ~5000 wierszy i sortowanie top-N, 1707
trafień w `shared buffers`, **zero odczytów z dysku**.

| N równoległych zapytań | 1 | 2 | **3** | 4 | 5 | 6 | 7 | 8 | 10 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|
| przepustowość (zapytań/s) | 1 035 | 1 868 | **1 902** | 1 730 | 1 596 | 1 375 | 1 264 | 1 183 | 995 | 854 |
| średni czas zapytania (ms) | 0,97 | 1,07 | 1,58 | 2,31 | 3,13 | 4,37 | 5,54 | 6,80 | 10,09 | 16,53 |

Krzywa ma kolano przy **N ≈ 3** i dalej **opada**: przy N = 10 baza obsługuje mniej
zapytań na sekundę niż przy N = 2, mimo pięciokrotnie większej równoległości.
Powyżej liczby dostępnych rdzeni dodatkowa równoległość nie kupuje już
przepustowości, tylko dokłada rywalizację o procesor.

Obie aplikacje pracują na opadającej gałęzi, a implementacja obiektowa **dalej
w prawo** — i to w całości tłumaczy wynik. Krzywa przewiduje kierunek i rząd
wielkości różnicy z samej równoległości, bez żadnego odwołania do paradygmatu:

| | zmierzona równoległość | czas zapytania z krzywej | czas zmierzony |
|---|---|---|---|
| functional | 4,73 | ~2,9 ms | 3,61 ms |
| OOP | 7,00 | 5,54 ms | 6,48 ms |

Podczas obu przebiegów Postgres jest nasycony niemal identycznie (CPU 150,8%
wobec 145,8% przy limicie 200%), a kontenery aplikacji pozostają daleko od
swojego limitu (35,2% i 18,6% przy limicie 100%). Wąskim gardłem jest baza,
nie aplikacja.

## Dowód 4 — profil A z macierzy głównej

Jeżeli mechanizmem jest przeciążenie bazy, to **poniżej kolana krzywej znak
różnicy musi się odwrócić**. Profil A (1 VU) daje równoległość bazy równą 1 —
i archiwalne dane potwierdzają predykcję bez potrzeby nowego pomiaru:

| S3, profil A (1 VU) | functional | OOP | Δ |
|---|---|---|---|
| czas żądania — średnia (ms) | 1,22 | 1,13 | **+7,2%** |
| przepustowość (req/s) | 766,1 | 819,2 | **−6,5%** |

Przy jednym użytkowniku implementacja funkcyjna jest **wolniejsza**, zgodnie
z H2–H4. Przewaga pojawia się wyłącznie tam, gdzie baza jest przeciążona,
i rośnie z obciążeniem (−10,6% → −13,4% → −15,4%) dokładnie tak, jak rośnie
odległość od kolana krzywej.

## Dlaczego pozostałe scenariusze nie odwracają znaku

Mechanizm wymaga, żeby wąskim gardłem była procesorowa praca bazy. Plany zapytań
tłumaczą, dlaczego dotyczy to tylko S3:

| scenariusz | praca bazy na żądanie | wąskie gardło | wynik |
|---|---|---|---|
| S3 lista produktów | bitmapowy odczyt ~5000 wierszy + sortowanie, **2,86 ms** | baza (2 rdzenie) | functional szybszy |
| S4 szczegół produktu | odczyt indeksowy po kluczu głównym, **0,044 ms** (65× taniej) | aplikacja | OOP szybszy o 28–36% |
| S1, S2 rejestracja i logowanie | dominuje bcrypt (~40 ms w aplikacji) | bcrypt | bez różnicy |
| S5, S6 koszyk i zamówienie | zapisy w transakcji, rywalizacja o blokady wiersza, nie o procesor | blokady w bazie | OOP szybszy o 14–24% |

Znak różnicy jest więc funkcją tego, który element systemu jest wysycony —
a nie samego paradygmatu. To najważniejsza obserwacja całej serii pomiarowej
i należy do rozdziału 10.

## Odtworzenie

```bash
docker compose up -d                        # środowisko jak w macierzy głównej

./benchmarks/probes/run_probe.sh diag       # warstwa aplikacji bez bazy
./benchmarks/probes/run_probe.sh list20     # realne zapytanie S3
./benchmarks/probes/run_probe.sh list1      # kontrola: mniej wierszy
./benchmarks/probes/run_probe.sh list50     # kontrola: więcej wierszy

# krzywa przepustowości bazy (bez kodu aplikacji)
docker cp benchmarks/probes/pg_curve.js mg_oop:/tmp/pg_curve.js
docker exec -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME=postgres \
  -e DB_USER=postgres -e DB_PASSWORD=postgres -e DURATION_MS=10000 \
  mg_oop node /tmp/pg_curve.js
```

Jedna konfiguracja to ~2 min (rozgrzewka 15 s + pomiar 45 s × 2 implementacje),
krzywa ~2,5 min. Wyniki trafiają do `benchmarks/probes/out/` (poza repozytorium,
jak cały surowy materiał pomiarowy).

`run_probe.sh` zeruje `pg_stat_statements`, czyli **globalny** licznik serwera —
nie uruchamiać równolegle z innym obciążeniem tej instancji Postgresa.

## Ograniczenia

1. **Jeden przebieg na konfigurację.** Sonda ustala mechanizm, nie mierzy
   wielkości efektu — ta pochodzi z macierzy głównej, gdzie każda para ma trzy
   powtórzenia i 95% przedział ufności. Powtarzalność kierunku wynika tu
   z zgodności czterech niezależnych pomiarów, nie z rozrzutu międzyprzebiegowego.
2. **Stałe obciążenie zamiast rampy.** Profile A–D mają fazę narastania; sonda
   celowo jej nie ma, bo mierzy koszt na żądanie w jednorodnym oknie.
3. **Bez restartu aplikacji między konfiguracjami** (macierz główna restartuje
   przed każdym pomiarem). Liczniki GC i histogram pętli zdarzeń są zerowane, ale
   sterta narasta przez całą serię — wartości `heapUsed` z sondy są poglądowe.
   Kolejność (functional, potem OOP) jest ta sama we wszystkich konfiguracjach.
4. **Kolano krzywej zależy od limitu rdzeni Postgresa** (`cpus: '2'`
   w `docker-compose.yml`). Przy innym limicie położenie kolana się przesunie,
   a przy limicie wysokim wobec obciążenia anomalia S3 powinna zniknąć.
   Ta predykcja nie została zmierzona.
