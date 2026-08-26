# Macierz 2026-08-24/25 zastapiona — wyrownanie warstwy HTTP

Kompletna macierz 72 par (S1-S6 x A-D x 3) plus 2 niepelne powtorzenia S1/A
z przerwanego przemiaru. Pomiary technicznie poprawne, zero uspien systemu.
Odrzucone, bo wykonano je przed wyrownaniem trzech asymetrii warstwy HTTP.

## Znalezione asymetrie (2026-08-25)

Wszystkie trzy doliczaly prace **wylacznie implementacji funkcyjnej**:

1. `express.urlencoded({extended: true})` — middleware wykonywany przy kazdym
   zadaniu, nieobecny w `apps/oop/src/app.ts` i nieuzywany przez zaden
   z 16 endpointow (kontrakt przyjmuje wylacznie ciala JSON).
2. `/db-test` — martwa trasa (zwracala zaszyty komunikat, nie dotykala bazy)
   zarejestrowana **przed wszystkimi trasami API**. Express dopasowuje trasy
   liniowo, wiec kazde zadanie API przechodzilo najpierw przez jej dopasowanie.
3. `/db-query` — martwa trasa na koncu lancucha, cale cialo zakomentowane.

Funkcyjna miala 21 tras, obiektowa 19.

## Dlaczego to dyskwalifikuje pomiary

Nie skala — rzad wielkosci to jednostki mikrosekund na zadanie, podobnie jak
usunieta wczesniej roznica `LIMIT 1` (~5 us). Dyskwalifikuje **kierunek
i zasieg**:

- Kierunek: obciazenie dzialalo na niekorzysc implementacji funkcyjnej, czyli
  zgodnie z hipotezami H2-H4. Artefakt pomiarowy wskazujacy w te sama strone
  co hipoteza potwierdza teze z niewlasciwego powodu.
- Zasieg: middleware i dopasowanie tras dzialaja przy **kazdym** zadaniu,
  we wszystkich szesciu scenariuszach — nie tylko w S1/S2 jak `LIMIT 1`.

## Stan po naprawie

Zbiory tras identyczne (19 = 19), stos middleware identyczny, wszystkie
zapytania SQL identyczne co do znaku. Zweryfikowane na zywych aplikacjach:
usuniete trasy zwracaja 404 w obu, kontrakt odpowiada tymi samymi kodami.

## Zastosowanie

Zachowane dla audytu i porownania „przed / po". NIE laczyc z nowa seria.
