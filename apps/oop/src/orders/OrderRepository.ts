import {Pool} from 'pg';
import type {DbOrder, DbOrderItem, OrderWithItems} from './OrderTypes';

export class OrderRepository {
  constructor(private pool: Pool) {}

  async placeOrder(userId: number): Promise<OrderWithItems> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const {rows: cartItems} = await client.query<{
        productId: number;
        quantity: number;
        stock: number;
        price: string;
        productName: string;
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
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [
          item.quantity,
          item.productId,
        ]);
      }

      const {rows: [order]} = await client.query<DbOrder>(
        `INSERT INTO orders (user_id, total_price)
         VALUES ($1, $2)
         RETURNING id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"`,
        [userId, totalPrice],
      );

      const orderItemRows = await Promise.all(
        cartItems.map((item) =>
          client.query<DbOrderItem>(
            `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
             VALUES ($1, $2, $3, $4)
             RETURNING id, order_id as "orderId", product_id as "productId", quantity, price_at_purchase as "priceAtPurchase"`,
            [order.id, item.productId, item.quantity, item.price],
          ),
        ),
      );

      const items: DbOrderItem[] = orderItemRows.map((r, i) => ({
        ...r.rows[0],
        productName: cartItems[i].productName,
      }));

      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
      await client.query('COMMIT');

      return {...order, items};
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelOrder(userId: number, orderId: number): Promise<DbOrder> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const {rows: [order]} = await client.query<DbOrder>(
        `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
         FROM orders
         WHERE id = $1 AND user_id = $2
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
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
          item.quantity,
          item.productId,
        ]);
      }

      const {rows: [cancelled]} = await client.query<DbOrder>(
        `UPDATE orders SET status = 'cancelled' WHERE id = $1
         RETURNING id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"`,
        [orderId],
      );

      await client.query('COMMIT');
      return cancelled;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async findByUser(userId: number): Promise<OrderWithItems[]> {
    const {rows: orders} = await this.pool.query<DbOrder>(
      `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );

    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const {rows: items} = await this.pool.query<DbOrderItem & {orderId: number}>(
      `SELECT
         oi.id,
         oi.order_id as "orderId",
         oi.product_id as "productId",
         oi.quantity,
         oi.price_at_purchase as "priceAtPurchase",
         COALESCE(p.name, 'Deleted product') as "productName"
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ANY($1::int[])`,
      [orderIds],
    );

    const itemsByOrder = items.reduce<Record<number, DbOrderItem[]>>((acc, item) => {
      const {orderId, ...rest} = item;
      if (!acc[orderId]) acc[orderId] = [];
      acc[orderId].push(rest as DbOrderItem);
      return acc;
    }, {});

    return orders.map((o) => ({...o, items: itemsByOrder[o.id] ?? []}));
  }

  async findById(userId: number, orderId: number): Promise<OrderWithItems | null> {
    const {rows: [order]} = await this.pool.query<DbOrder>(
      `SELECT id, user_id as "userId", status, total_price as "totalPrice", created_at as "createdAt"
       FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (!order) return null;

    const {rows: items} = await this.pool.query<DbOrderItem>(
      `SELECT
         oi.id,
         oi.order_id as "orderId",
         oi.product_id as "productId",
         oi.quantity,
         oi.price_at_purchase as "priceAtPurchase",
         COALESCE(p.name, 'Deleted product') as "productName"
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [orderId],
    );

    return {...order, items};
  }
}
