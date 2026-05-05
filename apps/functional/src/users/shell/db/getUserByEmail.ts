import {Pool} from 'pg';
import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {executeQueryWithPool} from '@common/shell/database';
import {TDbUser} from '@users/core/types';

export const getUserByEmail = (pool: Pool, email: string) =>
  pipe(
    executeQueryWithPool<TDbUser>(
      pool,
      `SELECT id,
              name,
              surname,
              email,
              password,
              created_at as "createdAt"
       FROM users
       WHERE email = $1`,
      [email],
    ),
    TE.map((rows) => rows[0] ?? null),
  );
