import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import type {TDbOrder, TDbOrderItem, TOrderWithItems} from '@orders/core/types';

export const getOrdersFromDb = (pool: Pool, userId: number): TE.TaskEither<Error, TOrderWithItems[]> =>
  TE.tryCatch(
    async () => {
      const {rows: orders} = await pool.query<TDbOrder>(
        `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
         FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );

      if (orders.length === 0) return [];

      const orderIds = orders.map((o) => o.id);
      const {rows: items} = await pool.query<TDbOrderItem & {orderId: number}>(
        `SELECT
           oi.id, oi.order_id as "orderId", oi.product_id as "productId",
           oi.quantity, oi.price_at_purchase as "priceAtPurchase",
           COALESCE(p.name, 'Deleted product') as "productName"
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ANY($1::int[])`,
        [orderIds],
      );

      const itemsByOrder = items.reduce<Record<number, TDbOrderItem[]>>((acc, item) => {
        if (!acc[item.orderId]) acc[item.orderId] = [];
        acc[item.orderId].push(item);
        return acc;
      }, {});

      return orders.map((order) => ({...order, items: itemsByOrder[order.id] ?? []}));
    },
    (reason) => (reason instanceof Error ? reason : new Error(String(reason))),
  );
