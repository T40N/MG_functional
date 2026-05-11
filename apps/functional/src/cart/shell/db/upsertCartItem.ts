import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';
import type {TCartItemInput, TDbCartItem} from '@cart/core/types';

export const upsertCartItemInDb = (pool: Pool, input: TCartItemInput): TE.TaskEither<Error, TDbCartItem> =>
  pipe(
    executeQueryWithPool<TDbCartItem>(
      pool,
      `WITH upserted AS (
         INSERT INTO cart_items (user_id, product_id, quantity, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (user_id, product_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, expires_at = NOW() + INTERVAL '15 minutes'
         RETURNING id, user_id, product_id, quantity, reserved_at, expires_at
       )
       SELECT
         u.id,
         u.user_id as "userId",
         u.product_id as "productId",
         u.quantity,
         u.reserved_at as "reservedAt",
         u.expires_at as "expiresAt",
         p.name as "productName",
         p.price as "productPrice"
       FROM upserted u
       JOIN products p ON p.id = u.product_id`,
      [input.userId, input.productId, input.quantity],
    ),
    TE.chain((rows) =>
      rows[0] ? TE.right(rows[0]) : TE.left(new Error('CartItemNotSaved')),
    ),
  );
