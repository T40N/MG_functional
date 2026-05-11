import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbCategory, TCategoryToSave} from '@categories/core/types';

export const saveCategory = (pool: Pool, category: TCategoryToSave): TE.TaskEither<Error, TDbCategory> =>
  pipe(
    executeQueryWithPool<TDbCategory>(
      pool,
      `INSERT INTO categories (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at as "createdAt"`,
      [category.name, category.description ?? null],
    ),
    TE.chain((rows) =>
      rows[0] ? TE.right(rows[0]) : TE.left(new Error('CategoryNotSaved')),
    ),
  );
