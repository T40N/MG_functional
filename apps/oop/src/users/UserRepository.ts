import { Pool } from 'pg';
import type { DbUser, UserToSave } from './UserTypes';

export class UserRepository {
  constructor(private pool: Pool) {}

  async findByEmail(email: string): Promise<DbUser | null> {
    const { rows } = await this.pool.query<DbUser>(
      'SELECT id, name, surname, email, password, created_at as "createdAt" FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    return rows[0] ?? null;
  }

  async save(user: UserToSave): Promise<DbUser> {
    const { rows } = await this.pool.query<DbUser>(
      `INSERT INTO users (name, surname, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, surname, email, password, created_at as "createdAt"`,
      [user.name, user.surname, user.email, user.password],
    );
    return rows[0];
  }
}
