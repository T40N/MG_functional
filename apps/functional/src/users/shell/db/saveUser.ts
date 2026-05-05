import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import {TDbUser, TUserToSave} from '@users/core/types';

export const saveUser = (pool: Pool, userToSave: TUserToSave) =>
  pipe(
    executeQueryWithPool<TDbUser>(
      pool,
      `INSERT INTO users (email, name, surname, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id,
                 name,
                 surname,
                 email,
                 password,
                 created_at as "createdAt"`,
      [
        userToSave.email,
        userToSave.name,
        userToSave.surname,
        userToSave.password,
      ],
    ),
    TE.chain((rows) =>
      rows[0] ? TE.right(rows[0]) : TE.left(new Error('UserNotSaved')),
    ),
  );