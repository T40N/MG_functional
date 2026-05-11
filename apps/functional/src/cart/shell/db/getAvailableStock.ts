import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';

export const getAvailableStock = (
  pool: Pool,
  productId: number,
  excludeUserId: number,
): TE.TaskEither<Error, number | null> =>
  pipe(
    executeQueryWithPool<{availableStock: number}>(
      pool,
      `SELECT
         p.stock - COALESCE(
           (SELECT SUM(ci.quantity)
            FROM cart_items ci
            WHERE ci.product_id = p.id
              AND ci.expires_at > NOW()
              AND ci.user_id != $2),
           0
         ) as "availableStock"
       FROM products p
       WHERE p.id = $1`,
      [productId, excludeUserId],
    ),
    TE.map((rows) => (rows[0] != null ? Number(rows[0].availableStock) : null)),
  );
