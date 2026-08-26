import {Pool, PoolClient} from 'pg';
import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import path from 'path';
import fs from 'fs';

// Configuration types for database connection
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Create a database configuration from environment variables or use defaults
export const getDbConfig = (env: NodeJS.ProcessEnv): E.Either<Error, DbConfig> => {
  const config: DbConfig = {
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '5432', 10),
    database: env.DB_NAME || 'postgres',
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || 'postgres',
  };

  // Validate configuration
  if (isNaN(config.port)) {
    return E.left(new Error(`Invalid database port: ${env.DB_PORT}`));
  }

  return E.right(config);
};

// Create a database pool
export const createDbPool = (config: DbConfig): Pool => {
  return new Pool(config);
};

// Connect to the database
export const connectToDb = (pool: Pool): TE.TaskEither<Error, PoolClient> =>
  TE.tryCatch(
    () => pool.connect(),
    (reason) => new Error(`Failed to connect to database: ${reason}`),
  );

// Execute a query with parameters
export const executeQuery = <T>(
  client: PoolClient,
  query: string,
  params: unknown[] = [],
): TE.TaskEither<Error, T[]> =>
    TE.tryCatch(
      async () => {
        const result = await client.query(query, params);
        return result.rows as T[];
      },
      (reason) => new Error(`Query execution failed: ${reason}`),
    );

/**
 * Wykonuje zapytanie na kliencie z puli, ZAWSZE zwracajac klienta do puli.
 *
 * Wczesniej zwolnienie bylo realizowane przez `TE.chainFirst(() =>
 * releaseClient(client))`. `chainFirst` jest aliasem `tap` i uruchamia swoja
 * funkcje WYLACZNIE dla `Right` — kazdy blad SQL (a `executeQuery` opakowuje
 * blad w `Left`) trwale wypychal klienta z puli. Po dziesieciu bledach pula
 * o domyslnym rozmiarze 10 przestawala odpowiadac. Strona obiektowa uzywa
 * `pool.query()`, ktore zwalnia klienta na obu sciezkach, wiec byl to defekt
 * asymetryczny, obciazajacy wylacznie implementacje funkcyjna.
 *
 * `TE.bracket` gwarantuje wykonanie kroku zwalniajacego niezaleznie od wyniku —
 * jest to funkcyjny odpowiednik `try/finally`, wiec poprawka nie osłabia
 * czystosci stylu, ktory praca mierzy.
 */
export const executeQueryWithPool = <T>(
  pool: Pool,
  query: string,
  params: unknown[] = [],
): TE.TaskEither<Error, T[]> =>
    TE.bracket(
      connectToDb(pool),
      (client) => executeQuery<T>(client, query, params),
      (client) => releaseClient(client),
    );

// Release a client back to the pool
export const releaseClient = (client: PoolClient): TE.TaskEither<Error, void> =>
  TE.tryCatch(
    () => {
      client.release();
      return Promise.resolve();
    },
    (reason) => new Error(`Failed to release client: ${reason}`),
  );

// Initialize database connection
export const initializeDb = (env: NodeJS.ProcessEnv): TE.TaskEither<Error, Pool> =>
  pipe(
    getDbConfig(env),
    TE.fromEither<Error, DbConfig>,
    TE.map(createDbPool),
    TE.chainFirst<Error, Pool, void>((pool) =>
      pipe(
        connectToDb(pool),
        TE.chainFirst((client) =>
          pipe(
            executeQuery(client, 'SELECT NOW()'),
            TE.chainFirst(() => releaseClient(client)),
          ),
        ),
        TE.map(() => {
          console.log('Database connection successful');
          return undefined;
        }),
        TE.orElse((error) => {
          console.error(`Database connection test failed: ${error.message}`);
          return TE.right(undefined);
        }),
      ),
    ),
  );

export const runMigrations = (pool: Pool, migrationsDir: string): TE.TaskEither<Error, void> =>
  TE.tryCatch(
    async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          name TEXT PRIMARY KEY,
          run_at TIMESTAMP DEFAULT now()
        )
      `);

      const files = await fs.promises.readdir(migrationsDir);
      const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

      for (const file of sqlFiles) {
        const { rows } = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
        if (rows.length > 0) continue;

        const sql = await fs.promises.readFile(path.join(migrationsDir, file), 'utf8');
        await pool.query(sql);
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        console.log(`Migration ${file} executed successfully`);
      }
    },
    (reason) => new Error(`Failed to run migrations: ${reason}`),
  );
