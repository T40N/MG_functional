import {Pool} from 'pg';
import type {CartItemInput, DbCartItem} from './CartTypes';

export class CartRepository {
  constructor(private pool: Pool) {}

  async getCartItems(userId: number): Promise<DbCartItem[]> {
    const {rows} = await this.pool.query<DbCartItem>(
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
    return rows;
  }

  async getAvailableStock(productId: number, excludeUserId: number): Promise<number | null> {
    const {rows} = await this.pool.query<{availableStock: number}>(
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
    );
    return rows[0] != null ? Number(rows[0].availableStock) : null;
  }

  async upsertCartItem(input: CartItemInput): Promise<DbCartItem> {
    const {rows} = await this.pool.query<DbCartItem>(
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
    );
    return rows[0];
  }

  async removeCartItem(userId: number, productId: number): Promise<void> {
    await this.pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
  }

  async clearCart(userId: number): Promise<void> {
    await this.pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
  }
}
