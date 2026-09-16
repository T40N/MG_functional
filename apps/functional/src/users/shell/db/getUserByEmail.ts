import {Pool} from 'pg';
import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {executeQueryWithPool} from '@common/shell/database';
import {TDbUser} from '@users/core/types';

export const getUserByEmail = (pool: Pool, email: string) =>
  pipe(
    executeQueryWithPool<TDbUser>(
      pool,
      // LIMIT 1 jest logicznie zbędny — users.email ma UNIQUE CONSTRAINT,
      // więc zapytanie zwraca co najwyżej jeden wiersz. Zapis pozostaje
      // celowo identyczny z apps/oop/src/users/UserRepository.ts, żeby obie
      // implementacje wykonywały dokładnie ten sam plan zapytania. Różnica
      // wynosiła ~5 µs na żądanie i była jedyną asymetrią SQL między
      // aplikacjami; wyrównana przed ponownym pomiarem S1/S2 (2026-08-25).
      `SELECT id,
              name,
              surname,
              email,
              password,
              created_at as "createdAt"
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    ),
    TE.map((rows) => rows[0] ?? null),
  );
