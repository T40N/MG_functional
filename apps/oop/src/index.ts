import path from 'path';
import { createPool, runMigrations } from './common/database/Database';
import { buildApp } from './app';

const getMigrationsDir = (): string =>
  process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../database/migrations');

async function main() {
  const pool = createPool(process.env);

  await runMigrations(pool, getMigrationsDir());

  const app = buildApp(pool);
  const port = Number(process.env.PORT ?? 3001);

  app.listen(port, () => {
    console.log(`OOP app running on port ${port}`);
  });
}

main().catch(err => {
  console.error('Failed to start OOP app:', err);
  process.exit(1);
});
