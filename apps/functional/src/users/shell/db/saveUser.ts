import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import {TDbUser, TUserToSave} from '@users/core/types';

export const saveUser = (pool: Pool, userToSave: TUserToSave) =>
  pipe(
    executeQueryWithPool<TDbUser>(
      pool,
      // Kolejność kolumn celowo identyczna z apps/oop/src/users/UserRepository.ts.
      // Semantycznie obojętna, ale rozdziały 5 i 6 zestawiają odpowiadające
      // sobie fragmenty kodu obok siebie — każda widoczna różnica niewynikająca
      // z paradygmatu osłabia tezę o kontrolowanym porównaniu.
      `INSERT INTO users (name, surname, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id,
                 name,
                 surname,
                 email,
                 password,
                 created_at as "createdAt"`,
      [
        userToSave.name,
        userToSave.surname,
        userToSave.email,
        userToSave.password,
      ],
    ),
    TE.chain((rows) =>
      rows[0] ? TE.right(rows[0]) : TE.left(new Error('UserNotSaved')),
    ),
  );