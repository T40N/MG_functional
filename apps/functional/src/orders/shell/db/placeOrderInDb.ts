import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import type {TDbOrder, TDbOrderItem, TOrderWithItems} from '@orders/core/types';

export const placeOrderInDb = (pool: Pool, userId: number): TE.TaskEither<Error, TOrderWithItems> =>
  TE.tryCatch(
    async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const {rows: cartItems} = await client.query<{
          productId: number; quantity: number; stock: number; price: string; productName: string;
        }>(
          `SELECT ci.product_id as "productId", ci.quantity, p.stock, p.price, p.name as "productName"
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
           WHERE ci.user_id = $1 AND ci.expires_at > NOW()
           FOR UPDATE OF p`,
          [userId],
        );

        if (cartItems.length === 0) {
          await client.query('ROLLBACK');
          throw new Error('CartEmpty');
        }

        for (const item of cartItems) {
          if (item.stock < item.quantity) {
            await client.query('ROLLBACK');
            throw new Error('InsufficientStock');
          }
        }

        const totalPrice = cartItems
          .reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0)
          .toFixed(2);

        for (const item of cartItems) {
          await client.query(
            'UPDATE products SET stock = stock - $1 WHERE id = $2',
            [item.quantity, item.productId],
          );
        }

        const {rows: [order]} = await client.query<TDbOrder>(
          `INSERT INTO orders (user_id, total_price)
           VALUES ($1, $2)
           RETURNING id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"`,
          [userId, totalPrice],
        );

        const orderItems: TDbOrderItem[] = [];
        for (const item of cartItems) {
          const {rows: [orderItem]} = await client.query<Omit<TDbOrderItem, 'productName'>>(
            `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
             VALUES ($1, $2, $3, $4)
             RETURNING id, order_id as "orderId", product_id as "productId", quantity, price_at_purchase as "priceAtPurchase"`,
            [order.id, item.productId, item.quantity, item.price],
          );
          orderItems.push({...orderItem, productName: item.productName});
        }

        await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

        await client.query('COMMIT');
        client.release();

        return {...order, items: orderItems};
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        throw err;
      }
    },
    (reason) => (reason instanceof Error ? reason : new Error(String(reason))),
  );
