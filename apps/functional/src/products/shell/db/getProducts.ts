import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbProduct, TGetProductsFilter} from '@products/core/types';

export const getProductsFromDb = (pool: Pool, filter: TGetProductsFilter): TE.TaskEither<Error, TDbProduct[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.categoryId != null) {
    params.push(filter.categoryId);
    conditions.push(`category_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filter.limit ?? 20;
  const offset = ((filter.page ?? 1) - 1) * limit;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const query = `
    SELECT id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt"
    FROM products
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  return executeQueryWithPool<TDbProduct>(pool, query, params);
};
