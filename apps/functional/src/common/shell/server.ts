import express, { Request, Response } from 'express';
import path from 'path';
import { pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import { getWelcomeMessage, formatMessage } from '../core/usecases/get_messages';
import { Pool } from 'pg';
import { initializeDb, runMigrations } from './database';
import { registerUserRoutes } from '@users/shell/routes/registerUser';
import { registerLoginRoutes } from '@users/shell/routes/loginUser';

const getMigrationsDir = (env: NodeJS.ProcessEnv): string =>
  env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../database/migrations');

// Initialize database connection and run migrations
export const initializeDatabase = (env: NodeJS.ProcessEnv): TE.TaskEither<Error, Pool> =>
  pipe(
    initializeDb(env),
    TE.chainFirst((pool) => runMigrations(pool, getMigrationsDir(env))),
  );

// Create Express application
export const createApp = () => {
  const app = express();

  // Middleware to parse JSON bodies (side effect)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Define routes (side effect)
  app.get('/', (req: Request, res: Response) => {
    const message = pipe(
      getWelcomeMessage(),
      (msg) => formatMessage(msg)(O.none),
    );
    res.send(message);
  });

  // Add a route to test database connection
  app.get('/db-test', (req: Request, res: Response) => {
    // This is just a placeholder - in a real app, you would use the pool to query the database
    res.send({ message: 'Database connection is configured' });
  });

  // Register user routes
  registerUserRoutes(app);
  registerLoginRoutes(app);

  // Example route that demonstrates database query execution
  app.get('/db-query', (req: Request, res: Response) => {
    /*
    pipe(
      executeQueryWithPool(pool, 'SELECT NOW() as current_time'),
      TE.fold(
        (error) => {
          res.status(500).json({ error: error.message });
          return TE.right(undefined);
        },
        (result) => {
          res.json({ result });
          return TE.right(undefined);
        }
      )
    )();
    */

    // For now, just return a message
    res.send({ message: 'This route would execute a database query in a real application' });
  });

  return app;
};

// Start the server (side effect)
export const startServer = (app: express.Application, port: number): TE.TaskEither<Error, ReturnType<typeof app.listen>> =>
  TE.tryCatch(
    () => new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
        resolve(server);
      });
    }),
    (reason) => new Error(`Failed to start server: ${reason}`),
  );

// Parse port from environment or use default (pure function)
export const getPort = (env: NodeJS.ProcessEnv): E.Either<Error, number> =>
  pipe(
    O.fromNullable(env.PORT),
    O.map(port => {
      const parsed = parseInt(port, 10);
      return isNaN(parsed) ? E.left(new Error(`Invalid port: ${port}`)) : E.right(parsed);
    }),
    O.getOrElse(() => E.right(3000)),
  );
