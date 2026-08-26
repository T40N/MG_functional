# Pomiary S1 i S2 zastapione — wyrownanie implementacji 2026-08-25

Pomiary z serii 2026-08-24/25 dla scenariuszy S1 (rejestracja) i S2 (logowanie),
profile A-D, po 3 powtorzenia. Kompletne i technicznie poprawne — odrzucone
wylacznie dlatego, ze wykonano je przed wyrownaniem asymetrii SQL.

## Powod

`getUserByEmail` roznil sie miedzy implementacjami: wersja obiektowa miala
`LIMIT 1`, funkcyjna nie. Poniewaz `users.email` ma `UNIQUE CONSTRAINT`,
zapytanie zwraca co najwyzej jeden wiersz i `LIMIT` jest logicznie pusty —
oba plany uzywaja `Index Scan using users_email_key`, wersja OOP dokladala
jedynie wezel `Limit`.

Zmierzona roznica na rozgrzanych buforach (3 przebiegi):
functional 0,036 / 0,028 / 0,027 ms wobec OOP 0,023 / 0,022 / 0,022 ms,
czyli okolo **5 mikrosekund** na zadanie. Przy czasie obslugi ~40 ms
zdominowanym przez bcrypt to 0,012% — glęboko ponizej szumu pomiarowego
i trzydziestokrotnie mniej niz zmierzona roznica miedzy implementacjami
w S1/A (180 mikrosekund).

Drugą, semantycznie obojetna roznica byla kolejnosc kolumn w `INSERT INTO users`.

## Dlaczego mimo to przemierzono

Nie z powodu bledu pomiaru — z powodu tezy pracy. Praca opiera sie na
twierdzeniu, ze implementacje roznia sie **wylacznie paradygmatem**, a rozdzialy
5 i 6 zestawiaja odpowiadajace sobie fragmenty kodu obok siebie. Widoczna
roznica niewynikajaca z paradygmatu oslabialaby ten argument, niezaleznie od
tego, ze jej wplyw liczbowy jest pomijalny.

Po wyrownaniu wszystkie zapytania SQL obu aplikacji sa identyczne co do znaku.

## Zastosowanie

Pliki zachowane dla audytu i do ewentualnego porownania „przed / po".
NIE nalezy ich laczyc z nowa seria S1/S2 w analizie — pochodza z innego
stanu kodu.
