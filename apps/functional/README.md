# Express.js Server Project with TypeScript

This is a simple Express.js server project that demonstrates how to set up a local server with Express.js and TypeScript, and how to test it.

## Installation

To install the dependencies, run:

```bash
npm install
```

This will install:
- Express.js (production dependency)
- TypeScript and related type definitions (@types/express, @types/node, etc.)
- Jest, ts-jest, and Supertest (development dependencies for testing)
- ts-node and ts-node-dev (for TypeScript execution and development)
- Other development tools

## Building the Project

To compile the TypeScript code to JavaScript:

```bash
npm run build
```

This will create the compiled JavaScript files in the `dist` directory.

## Running the Server

To start the server in production mode (automatically builds first):

```bash
npm start
```

To start the server in development mode (with auto-restart on file changes):

```bash
npm run dev
```

The server will run on http://localhost:3000 by default. You can change the port by setting the PORT environment variable.

## Testing

To run the tests:

```bash
npm test
```

This will run Jest tests with TypeScript support that verify the server is working correctly.

## API Endpoints

- `GET /`: Returns a "Hello World" message indicating that the Express.js server is running.
- `GET /db-test`: Returns a message indicating that the database connection is configured.
- `GET /db-query`: Example endpoint demonstrating how to execute a database query in a functional style.

## Linting

This project uses ESLint with TypeScript support to enforce code style and catch potential issues.

To run the linter:

```bash
npm run lint
```

To automatically fix linting issues:

```bash
npm run lint:fix
```

### Configuring PyCharm for ESLint on Save

To enable automatic ESLint fixing on save in PyCharm:

1. Go to **Preferences** (or **Settings** on Windows/Linux)
2. Navigate to **Languages & Frameworks > JavaScript > Code Quality Tools > ESLint**
3. Make sure ESLint is enabled
4. Check the option **Run eslint --fix on save**
5. Click **Apply** and **OK**

## Database Connection

This project includes a PostgreSQL database connection implemented in a functional style using the `pg` library and `fp-ts`.

### Database Configuration

The database connection is configured using environment variables in the `.env` file:

- `DB_HOST`: Database host (default: 'postgres' for Docker, 'localhost' for local development)
- `DB_PORT`: Database port (default: '5432')
- `DB_NAME`: Database name (default: 'postgres')
- `DB_USER`: Database user (default: 'postgres')
- `DB_PASSWORD`: Database password (default: 'postgres')

These environment variables are used both by the application and the Docker Compose setup.

### Functional Database Operations

The database operations are implemented in a functional style using `fp-ts`:

- `getDbConfig`: Pure function that creates a database configuration from environment variables
- `createDbPool`: Creates a database connection pool
- `connectToDb`: Connects to the database using TaskEither for error handling
- `executeQuery`: Executes a query with parameters using TaskEither
- `executeQueryWithPool`: Example function that demonstrates how to execute a query with the pool
- `releaseClient`: Releases a client back to the pool
- `initializeDb`: Initializes the database connection and tests it

### Usage Example

```typescript
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';
import { executeQueryWithPool } from './shell/database';

// Assuming you have a pool instance
const pool: Pool = /* ... */;

// Execute a query
pipe(
  executeQueryWithPool(pool, 'SELECT * FROM users WHERE id = $1', [userId]),
  TE.fold(
    (error) => {
      console.error(`Error: ${error.message}`);
      return TE.right(undefined);
    },
    (users) => {
      console.log('Users:', users);
      return TE.right(undefined);
    }
  )
)();
```

## Project Structure

The project follows a Functional Core, Imperative Shell architecture:

- `src/core/`: Contains pure functional code with no side effects
  - `src/core/get_messages.ts`: Pure functions for message generation and formatting
- `src/shell/`: Contains code that interacts with the outside world (side effects)
  - `src/shell/server.ts`: Express server setup and routing (side effects)
  - `src/shell/database.ts`: Database connection and operations (side effects)
- `src/index.ts`: Main entry point that connects core and shell components
- `__tests__/server.test.ts`: Test file for the Express.js server
- `dist/`: Directory containing compiled JavaScript files
- `package.json`: Project configuration file with dependencies and scripts
- `tsconfig.json`: TypeScript configuration file
- `jest.config.js`: Jest configuration for TypeScript testing
- `.eslintrc.js`: ESLint configuration file
- `.eslintignore`: List of files and directories to be ignored by ESLint

## Functional Programming Approach

This project uses functional programming principles with the help of the `fp-ts` library:

- **Pure Functions**: Core logic is implemented as pure functions with no side effects
- **Immutability**: Data is treated as immutable
- **Function Composition**: Using `pipe` for composing functions
- **Option Type**: For handling nullable values
- **Either Type**: For handling operations that might fail
- **TaskEither Type**: For handling asynchronous operations that might fail

### Functional Core, Imperative Shell

The architecture separates the application into two parts:
1. **Functional Core**: Pure business logic with no side effects
2. **Imperative Shell**: Thin layer that handles side effects (I/O, network, etc.)

This separation makes the code more testable, maintainable, and easier to reason about.
