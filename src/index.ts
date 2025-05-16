import { pipe } from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import { createApp, getPort, startServer, initializeDatabase } from './shell/server';

// Create the Express application
const app = createApp();

// Only start the server if this file is being run directly (not imported)
if (require.main === module) {
  // Get port from environment or use default
  const portEither = getPort(process.env);

  // Start the server with proper error handling
  pipe(
    portEither,
    E.fold(
      (error) => {
        console.error(`Error getting port: ${error.message}`);
        process.exit(1);
      },
      (port) => {
        pipe(
          // Initialize database first
          initializeDatabase(process.env),
          TE.chainW(() => startServer(app, port)),
          TE.fold(
            (error) => async () => {
              console.error(`Error: ${error.message}`);
              process.exit(1);
            },
            () => async () => {
              // Server and database started successfully
              console.log(`Server started on port ${port} with database connection`);
            },
          ),
        )();
      },
    ),
  );
}

// Export app for testing
export default app;
