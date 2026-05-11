import {Pool} from 'pg';
import type {DbProduct, ProductFilter, ProductToSave} from './ProductTypes';

export class ProductRepository {
  constructor(private pool: Pool) {}

  async findAll(filter: ProductFilter): Promise<DbProduct[]> {
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

    const {rows} = await this.pool.query<DbProduct>(
      `SELECT id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt"
       FROM products ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return rows;
  }

  async findById(id: number): Promise<DbProduct | null> {
    const {rows} = await this.pool.query<DbProduct>(
      'SELECT id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt" FROM products WHERE id = $1 LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  }

  async categoryExists(id: number): Promise<boolean> {
    const {rows} = await this.pool.query<{exists: boolean}>(
      'SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1) as exists',
      [id],
    );
    return rows[0]?.exists ?? false;
  }

  async save(product: ProductToSave): Promise<DbProduct> {
    const {rows} = await this.pool.query<DbProduct>(
      `INSERT INTO products (name, description, price, stock, category_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt"`,
      [product.name, product.description ?? null, product.price, product.stock, product.categoryId ?? null],
    );
    return rows[0];
  }
}
