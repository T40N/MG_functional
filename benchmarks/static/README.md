# Metryki statyczne kodu — zadanie B7

Katalog zawiera pomiar, który nie uruchamia aplikacji: czyta kod źródłowy obu
implementacji i liczy jego rozmiar, złożoność cyklomatyczną i głębokość
zagnieżdżeń. Materiał dla **rozdziału 7 pracy (porównanie jakościowe)**, oś
uzupełniająca wobec pomiarów wydajnościowych z macierzy głównej.

Pomiar jest deterministyczny — zależy wyłącznie od zawartości `apps/`, więc
nagłówek `docs/metryki_statyczne.txt` zapisuje commit **ostatniej zmiany w `apps/`**,
a nie `HEAD`. Dzięki temu commit dodający sam pomiar nie unieważnia zapisanej
metryczki, a liczby da się odtworzyć przez `git checkout <hash> -- apps`.
Pomiar wykonany 2026-08-29 na kodzie z commitu `5fed312` (2026-08-26) — tego
samego, na którym zebrano macierz 72/72.

Narzędzia: własny licznik SLOC (`collect.js`) + **ESLint 8** z regułami
`complexity` i `max-depth` ustawionymi na próg `0` — przy takim progu każda
funkcja i każdy blok łamie regułę, a komunikat naruszenia niesie zmierzoną
wartość. ESLint nie ma trybu raportowania metryk; to standardowy sposób ich
wydobycia.

## Wynik

**Implementacja funkcyjna jest o 77% większa pod względem SLOC i ma 3,3× więcej
plików, ale jej pojedyncza funkcja jest prostsza: średnia złożoność cyklomatyczna
1,45 wobec 1,93, a udział funkcji o CC > 4 wynosi 2,3% wobec 13,0%.** Złożoność
nie znika — rozkłada się na dwukrotnie większą liczbę mniejszych jednostek
(258 funkcji wobec 123), przez co jej suma dla całej aplikacji jest wyższa
(374 wobec 238).

Obie implementacje wystawiają **dokładnie 20 punktów końcowych API** — to
niezależne potwierdzenie równoważności funkcjonalnej, mierzone na kodzie, a nie
na dokumentacji.

## Co dokładnie jest liczone

| Miara | Definicja |
|---|---|
| linie fizyczne | wszystkie wiersze pliku |
| **SLOC** | wiersze niepuste i niebędące komentarzem (heurystyka w stylu `cloc`: wiersz jest komentarzem, gdy po przycięciu zaczyna się od `//`, `/*` lub jest wewnątrz bloku otwartego takim wierszem) |
| **jednostka CC** | każda funkcja, funkcja strzałkowa, metoda i konstruktor — tak, jak liczy je reguła ESLint `complexity` |
| **CC** | złożoność cyklomatyczna jednostki: 1 + liczba rozgałęzień sterowania (`if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?:`, `??`) |
| **głębokość bloku** | zagnieżdżenie bloków sterowania wewnątrz funkcji (reguła `max-depth`) |
| punkt końcowy API | rejestracja trasy Express (`app.*` / `router.*` / `this.router.*`) |

Pliki `.d.ts` są liczone jako kod (są częścią implementacji), ale raportowane też
osobno. Migracje SQL są wspólne dla obu aplikacji (`database/migrations/`), więc
nie wchodzą do żadnego z liczników.

## Warstwy porównawcze

Każdy plik trafia do **jednej** warstwy. Warstwy są wspólne dla obu implementacji,
mimo że katalogi nazywają się inaczej — dopiero to czyni liczby porównywalnymi.

| Warstwa | Functional | OOP |
|---|---|---|
| Warstwa HTTP | `*/shell/routes/`, `*/shell/factories/` | `*Controller.ts` |
| Logika domenowa | `*/core/usecases/` | `*Service.ts` |
| Dostęp do danych | `*/shell/db/` | `*Repository.ts` |
| Walidacja | `*/shell/validation/` | `*/validators/` |
| Typy i model | `*/core/types/`, `*/core/effects/`, `*/shell/dtos/` | `*Types.ts`, `*/dtos/` |
| Infrastruktura | `src/common/**` | `src/common/**` |
| Bootstrap i serwer | `src/index.ts`, `src/common/shell/server.ts` | `src/index.ts`, `src/app.ts` |
| Testy | `__tests__/**` | `__tests__/**` |

Plik, którego nie da się przypisać, jest wypisywany na wyjściu jako ostrzeżenie —
pomiar nigdy nie gubi kodu po cichu.

## Rozmiar

| Miara (kod produkcyjny) | Functional | OOP | Δ |
|---|---|---|---|
| pliki `.ts` | 103 | 31 | +232,3% |
| w tym `.d.ts` | 34 | 0 | — |
| linie fizyczne | 2349 | 1318 | +78,2% |
| **SLOC** | **1977** | **1116** | **+77,2%** |
| średnia SLOC / plik | 19,2 | 36,0 | −46,7% |
| SLOC warstwy HTTP / punkt końcowy | 40,0 | 20,1 | +98,8% |

SLOC według warstwy:

| Warstwa | Functional | OOP | Δ |
|---|---|---|---|
| Warstwa HTTP | 640 | 322 | +98,8% |
| Logika domenowa | 198 | 120 | +65,0% |
| Dostęp do danych | 456 | 338 | +34,9% |
| Walidacja | 51 | 35 | +45,7% |
| Typy i model | 243 | 79 | +207,6% |
| Infrastruktura | 256 | 133 | +92,5% |
| Bootstrap i serwer | 133 | 89 | +49,4% |

Największa różnica bezwzględna leży w **warstwie HTTP** (+318 SLOC) i daje się
rozłożyć na składniki. Implementacja funkcyjna ma tu 16 osobnych plików tras,
każdy powtarzający ten sam prolog: **133 wiersze importów wobec 24** (kontroler
importuje raz na klasę, obsługującą kilka endpointów), **16 razy powtórzony
strażnik puli połączeń** (`res.app.dbPool` + gałąź błędu, ~5 SLOC każdy) oraz
**16 konstrukcji rekordu `env`** wiążących efekty z przypadkiem użycia.
Odpowiada to około dwóch trzecich różnicy; reszta to `E.fold` z osobną gałęzią
na każdy typ błędu domenowego — konstrukcja porównywalna długością z `try/catch`
kontrolera, bo implementacja obiektowa **nie ma** globalnego `errorHandler`
i rozgałęzia błędy wewnątrz każdej metody.

Wniosek dla rozdziału 7: różnica w warstwie HTTP nie bierze się z „gadatliwości"
stylu funkcyjnego w miejscu obsługi żądania, tylko z **braku wspólnego miejsca
na zależności** — to, co kontroler dostaje raz przez wstrzyknięcie w konstruktorze,
trasa funkcyjna montuje przy każdym żądaniu od nowa.

Druga co do wielkości różnica — warstwa typów — jest konsekwencją stylu:
34 osobne pliki `.d.ts` z typami środowisk i wyników wobec pięciu plików
`*Types.ts` w implementacji obiektowej.

## Złożoność

| Miara (kod produkcyjny) | Functional | OOP | Δ |
|---|---|---|---|
| jednostki CC (funkcje) | 258 | 123 | +109,8% |
| suma CC | 374 | 238 | +57,1% |
| **średnia CC / funkcję** | **1,45** | **1,93** | **−25,1%** |
| mediana CC | 1 | 1 | 0% |
| max CC | 7 | 7 | 0% |
| funkcje o CC > 10 | 0 | 0 | — |
| CC na 100 SLOC | 18,92 | 21,33 | −11,3% |

Rozkład:

| Przedział | Functional | OOP |
|---|---|---|
| CC = 1 | 193 (74,8%) | 77 (62,6%) |
| CC 2–4 | 59 | 30 |
| CC 5–10 | 6 | 16 |
| CC > 10 | 0 | 0 |
| **udział CC > 4** | **2,3%** | **13,0%** |

Średnia CC według warstwy (functional / OOP): HTTP 1,53 / 2,43 · logika domenowa
1,17 / 1,38 · dostęp do danych 1,80 / 1,84 · infrastruktura 1,41 / 2,00. Warstwa
dostępu do danych jest jedyną, w której obie implementacje mają praktycznie tę
samą złożoność — bo obie wykonują ten sam SQL i to on dyktuje rozgałęzienia.

Głębokość zagnieżdżeń: maksimum 3 w obu implementacjach; bloków na głębokości
≥ 2 jest 9 wobec 19 na korzyść implementacji funkcyjnej.

## Kod testowy

| Miara | Functional | OOP | Δ |
|---|---|---|---|
| pliki testów | 17 | 12 | +41,7% |
| SLOC testów | 1224 | 1070 | +14,4% |
| SLOC testów / SLOC kodu | 0,62 | 0,96 | −35,4% |

Implementacja funkcyjna ma **więcej kodu produkcyjnego, ale proporcjonalnie mniej
kodu testowego**. Przyczyna jest w architekturze, nie w staranności: przypadek
użycia typu `ReaderTaskEither` przyjmuje efekty jako zwykłe pole rekordu `env`,
więc test podaje funkcje-atrapy wprost, bez biblioteki mockującej i bez
przygotowania klas. Materiał do podrozdziału 7.3.

## Jak czytać te liczby

1. **Złożoność cyklomatyczna zaniża koszt kodu funkcyjnego.** Miara liczy
   rozgałęzienia obecne w składni języka. `pipe(x, TE.chain(f), TE.orElse(g))`
   ma dla parsera złożoność 1, choć wyraża rozgałęzienie na sukces i błąd —
   dokładnie to samo, co `if/else` liczone jako 2. Wyniku **nie wolno** czytać
   jako „kod funkcyjny jest prostszy"; poprawny wniosek brzmi: rozgałęzienia
   sterowania zostały przeniesione ze składni języka do kombinatorów biblioteki.
2. **Liczba plików to decyzja o granulacji, nie własność paradygmatu.** 103 wobec
   31 plików wynika z konwencji „jeden endpoint = jeden plik trasy" po stronie
   funkcyjnej i grupowania kilku endpointów w jednym kontrolerze po stronie
   obiektowej. Wiersz „SLOC HTTP / punkt końcowy" normalizuje tę różnicę i to on,
   a nie liczba plików, jest porównaniem uczciwym.
3. **Przewaga w głębokości zagnieżdżeń jest częściowo artefaktem.** Reguła
   `max-depth` liczy bloki sterowania, a nie zagnieżdżenie funkcji. Kod fp-ts
   zagnieżdża się przez kompozycję (funkcja w wywołaniu kombinatora), czego ta
   miara nie widzi.
4. **SLOC nie jest miarą jakości.** Mierzy nakład na zapisanie tej samej
   funkcjonalności — i tylko na tym poziomie jest tu używany.

## Ograniczenia

- Pomiar dotyczy **jednej pary implementacji jednej aplikacji**, pisanej przez
  jedną osobę. Nie uogólnia się na paradygmaty.
- Heurystyka SLOC nie rozpoznaje komentarza blokowego dopisanego na końcu wiersza
  z kodem (liczy taki wiersz jako kod). W repozytorium nie ma takich wierszy;
  ograniczenie to cena za odporność licznika na sekwencję `/*` wewnątrz literału
  tekstowego.
- Reguła `complexity` traktuje każdą funkcję strzałkową jako osobną jednostkę,
  także jednolinijkową funkcję przekazaną do kombinatora. To zawyża liczbę
  jednostek po stronie funkcyjnej i zaniża średnią CC — patrz punkt 1 powyżej.
- Wynik zależy od stanu drzewa roboczego. Przy nieczystym drzewie nagłówek pliku
  wynikowego zawiera adnotację `(drzewo robocze nieczyste)`.

## Odtworzenie

```bash
npm run metrics:static           # zapisuje docs/metryki_statyczne.txt
node benchmarks/static/collect.js  # to samo, tylko na stdout
```

Artefakty:

- `docs/metryki_statyczne.txt` — tabele w formacie zgodnym z `compare.py`
- `benchmarks/static/out/static_metrics.json` — dane surowe: każdy plik z jego
  warstwą, licznikami linii i listą funkcji wraz z CC i numerem wiersza
