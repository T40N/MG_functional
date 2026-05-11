import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbCategory} from '@categories/core/types';

export const getAllCategories = (pool: Pool): TE.TaskEither<Error, TDbCategory[]> =>
  pipe(
    executeQueryWithPool<TDbCategory>(
      pool,
      'SELECT id, name, description, created_at as "createdAt" FROM categories ORDER BY name ASC',
    ),
    TE.map((rows) => rows),
  );
