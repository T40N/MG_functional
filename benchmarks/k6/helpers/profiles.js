/**
 * Returns k6 options for the given load profile (A/B/C/D).
 * Used via:  export const options = getOptions(__ENV.PROFILE || 'A');
 */
export function getOptions(profile) {
  switch (profile) {
    case 'B':
      return {
        thresholds: {},   // bramki celowo puste — patrz komentarz przy profilu D
        stages: [
          { duration: '30s', target: 20 },
          { duration: '2m',  target: 20 },
          { duration: '30s', target: 0  },
        ],
      };

    case 'C':
      return {
        thresholds: {},   // bramki celowo puste — patrz komentarz przy profilu D
        stages: [
          { duration: '1m', target: 100 },
          { duration: '3m', target: 100 },
          { duration: '1m', target: 0   },
        ],
      };

    case 'D':
      return {
        // Profil D celowo NIE MA progow.
        //
        // Prog w k6 to bramka, nie miernik: jego przekroczenie konczy proces
        // kodem 99, a `set -e` w run_single.sh porzuca wtedy cala kombinacje
        // — razem z pozostalymi powtorzeniami i calym pomiarem OOP.
        // 2026-08-24 stracilismy tak s3/D: p(95)=583 ms przy progu 500 ms,
        // czyli pomiar UDANY (aplikacja po prostu nie miesci sie w SLO przy
        // 200 VU) zostal potraktowany jak awaria i skasowal 5 z 6 przebiegow.
        //
        // Przy 200 VU przekroczenie 500 ms to spodziewany wynik, a nie blad —
        // to wlasnie jest przedmiot pomiaru. Ocena SLO nalezy do compare.py,
        // ktore i tak liczy p(95) i odsetek bledow z plikow JSON.
        thresholds: {},
        stages: [
          { duration: '2m', target: 200 },
          { duration: '5m', target: 200 },
          { duration: '2m', target: 0   },
        ],
      };

    case 'WARMUP':
      // Rozgrzewka JIT — wyniki NIE sa nigdzie zapisywane ani analizowane.
      // Sluzy wylacznie doprowadzeniu V8 do stanu, w ktorym goracy kod jest
      // juz zoptymalizowany. Umiarkowane obciazenie przez 30 s wystarcza,
      // by funkcje obslugi zadania przeszly przez kompilacje optymalizujaca.
      return {
        thresholds: {},
        vus: 10,
        duration: '30s',
      };

    default: // 'A' — baseline, single VU
      return {
        thresholds: {},   // bramki celowo puste — patrz komentarz przy profilu D
        vus:      1,
        duration: '30s',
      };
  }
}
