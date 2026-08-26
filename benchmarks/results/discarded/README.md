# Odrzucone pomiary

## 2026-08-24, przebieg `overnight_1787580976`

`*_1787581869*` — S1 / profil B, powtórzenie 2 (start 16:31:09).
macOS wszedł w `Idle Sleep` o 16:30:13 (30 s po wygaszeniu ekranu) i przez
kolejną godzinę cyklicznie usypiał (Maintenance Sleep / DarkWake) aż do
17:34:22. Przebieg 3-minutowy trwał realnie ~67 minut — procesy k6 i aplikacji
były zamrażane, więc wszystkie metryki czasowe (latencja, RPS, CPU) są
bezwartościowe.

`*_1787586375*` — S1 / profil C, część `functional` (start 17:46:15).
Przebieg przerwany sygnałem SIGTERM o 17:47:24 (57 s z 5 min) — niekompletny,
brak części OOP.

Pliki zachowane wyłącznie dla audytu; nie wolno ich włączać do analizy.

`*_1787599071*` — S3 / profil D, powtórzenie 1, tylko część `functional`.
Przebieg zmierzył się poprawnie (p(95)=583 ms, 0% błędów), ale przekroczył
próg `p(95) < 500`. k6 konczy wtedy proces kodem 99, a `set -e` w
`run_single.sh` porzucilo cala kombinacje — czesc OOP nigdy nie wystartowala,
wiec nie ma z czym porownywac. Progi usuniete z `profiles.js`; ocena SLO
przeniesiona do `compare.py`. S3/D mierzone ponownie w dokladce.

`*_1787591499*` (S1/D) i `*_1787595263*` (S2/D) — same pliki diagnostyki i
`docker stats`, bez pliku wynikowego k6. Kolektory startuja przed k6, wiec
zdazyly zapisac probki, zanim k6 przerwal start na bledzie skladni progu.
Nie ma do nich zadnego pomiaru — S1/D i S2/D zmierzone ponownie w dokladce.
