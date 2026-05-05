import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';

export function createPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const config: PoolConfig = {
    host:     env.DB_HOST     ?? 'localhost',
    port:     Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME     ?? 'postgres',
    user:     env.DB_USER     ?? 'postgres',
    password: env.DB_PASSWORD ?? 'postgres',
  };
  return new Pool(config);
}

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMP DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
  }
}
