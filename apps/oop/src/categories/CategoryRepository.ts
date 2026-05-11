import {Pool} from 'pg';
import type {DbCategory, CategoryToSave} from './CategoryTypes';

export class CategoryRepository {
  constructor(private pool: Pool) {}

  async findAll(): Promise<DbCategory[]> {
    const {rows} = await this.pool.query<DbCategory>(
      `SELECT id, name, description, created_at as "createdAt" FROM categories ORDER BY name ASC`,
    );
    return rows;
  }

  async findByName(name: string): Promise<DbCategory | null> {
    const {rows} = await this.pool.query<DbCategory>(
      `SELECT id, name, description, created_at as "createdAt" FROM categories WHERE name = $1 LIMIT 1`,
      [name],
    );
    return rows[0] ?? null;
  }

  async save(category: CategoryToSave): Promise<DbCategory> {
    const {rows} = await this.pool.query<DbCategory>(
      `INSERT INTO categories (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at as "createdAt"`,
      [category.name, category.description ?? null],
    );
    return rows[0];
  }
}
