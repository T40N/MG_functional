import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import type {TDbOrder} from '@orders/core/types';

export const cancelOrderInDb = (pool: Pool, orderId: number, userId: number): TE.TaskEither<Error, TDbOrder> =>
  TE.tryCatch(
    async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const {rows: [order]} = await client.query<TDbOrder>(
          `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
           FROM orders WHERE id = $1 AND user_id = $2
           FOR UPDATE`,
          [orderId, userId],
        );

        if (!order) {
          await client.query('ROLLBACK');
          throw new Error('OrderNotFound');
        }

        if (order.status === 'cancelled') {
          await client.query('ROLLBACK');
          throw new Error('OrderAlreadyCancelled');
        }

        const {rows: orderItems} = await client.query<{productId: number; quantity: number}>(
          'SELECT product_id as "productId", quantity FROM order_items WHERE order_id = $1',
          [orderId],
        );

        for (const item of orderItems) {
          await client.query(
            'UPDATE products SET stock = stock + $1 WHERE id = $2',
            [item.quantity, item.productId],
          );
        }

        const {rows: [updated]} = await client.query<TDbOrder>(
          `UPDATE orders SET status = 'cancelled' WHERE id = $1
           RETURNING id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"`,
          [orderId],
        );

        await client.query('COMMIT');
        client.release();

        return updated;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        throw err;
      }
    },
    (reason) => (reason instanceof Error ? reason : new Error(String(reason))),
  );
