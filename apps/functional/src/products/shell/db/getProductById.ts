import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbProduct} from '@products/core/types';

export const getProductByIdFromDb = (pool: Pool, id: number): TE.TaskEither<Error, TDbProduct | null> =>
  pipe(
    executeQueryWithPool<TDbProduct>(
      pool,
      'SELECT id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt" FROM products WHERE id = $1 LIMIT 1',
      [id],
    ),
    TE.map((rows) => rows[0] ?? null),
  );
