import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbProduct, TProductToSave} from '@products/core/types';

export const saveProduct = (pool: Pool, product: TProductToSave): TE.TaskEither<Error, TDbProduct> =>
  pipe(
    executeQueryWithPool<TDbProduct>(
      pool,
      `INSERT INTO products (name, description, price, stock, category_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt"`,
      [product.name, product.description ?? null, product.price, product.stock, product.categoryId ?? null],
    ),
    TE.chain((rows) =>
      rows[0] ? TE.right(rows[0]) : TE.left(new Error('ProductNotSaved')),
    ),
  );
