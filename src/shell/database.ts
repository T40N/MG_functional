import { Pool, PoolClient } from 'pg';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import path from 'path';
import fs from 'fs';

// Configuration type for database connection
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

// Example of a function to execute a query with the pool
export const executeQueryWithPool = <T>(
  pool: Pool,
  query: string,
  params: unknown[] = [],
): TE.TaskEither<Error, T[]> =>
    pipe(
      connectToDb(pool),
      TE.chain(client =>
        pipe(
          executeQuery<T>(client, query, params),
          TE.chainFirst(() => releaseClient(client)),
        ),
      ),
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

export const runMigrations = (pool: Pool): TE.TaskEither<Error, void> =>
  TE.tryCatch(
    async () => {
      const migrationsDir = path.join(__dirname, 'migrations');
      const files = await fs.promises.readdir(migrationsDir);

      // Filter for .sql files and sort them
      const sqlFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Execute each migration in sequence
      for (const file of sqlFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.promises.readFile(filePath, 'utf8');

        // Execute the SQL
        const result = await executeQueryWithPool(pool, sql)();

        if (E.isLeft(result)) {
          throw new Error(`Migration ${file} failed: ${result.left.message}`);
        }

        console.log(`Migration ${file} executed successfully`);
      }

      console.log('All migrations completed successfully');
    },
    (reason) => new Error(`Failed to run migrations: ${reason}`),
  );
