import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbCategory} from '@categories/core/types';

export const getCategoryByName = (pool: Pool, name: string): TE.TaskEither<Error, TDbCategory | null> =>
  pipe(
    executeQueryWithPool<TDbCategory>(
      pool,
      'SELECT id, name, description, created_at as "createdAt" FROM categories WHERE name = $1 LIMIT 1',
      [name],
    ),
    TE.map((rows) => rows[0] ?? null),
  );
