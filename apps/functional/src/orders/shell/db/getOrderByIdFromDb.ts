import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import type {TDbOrder, TDbOrderItem, TOrderWithItems} from '@orders/core/types';

export const getOrderByIdFromDb = (
  pool: Pool,
  orderId: number,
  userId: number,
): TE.TaskEither<Error, TOrderWithItems | null> =>
  TE.tryCatch(
    async () => {
      const {rows: [order]} = await pool.query<TDbOrder>(
        `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
         FROM orders WHERE id = $1 AND user_id = $2`,
        [orderId, userId],
      );

      if (!order) return null;

      const {rows: items} = await pool.query<TDbOrderItem>(
        `SELECT
           oi.id, oi.order_id as "orderId", oi.product_id as "productId",
           oi.quantity, oi.price_at_purchase as "priceAtPurchase",
           COALESCE(p.name, 'Deleted product') as "productName"
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [orderId],
      );

      return {...order, items};
    },
    (reason) => (reason instanceof Error ? reason : new Error(String(reason))),
  );
