import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TDbCartItem} from '@cart/core/types';

export const getCartItems = (pool: Pool, userId: number): TE.TaskEither<Error, TDbCartItem[]> =>
  executeQueryWithPool<TDbCartItem>(
    pool,
    `SELECT
       ci.id,
       ci.user_id as "userId",
       ci.product_id as "productId",
       ci.quantity,
       ci.reserved_at as "reservedAt",
       ci.expires_at as "expiresAt",
       p.name as "productName",
       p.price as "productPrice"
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 AND ci.expires_at > NOW()
     ORDER BY ci.reserved_at ASC`,
    [userId],
  );
