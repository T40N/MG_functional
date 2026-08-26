import express, { Request, Response } from 'express';
import path from 'path';
import { pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import { getWelcomeMessage, formatMessage } from '../core/usecases/get_messages';
import { createResponse } from '../core/usecases/createResponse';
import { Pool } from 'pg';
import { initializeDb, runMigrations } from './database';
import { registerUserRoutes } from '@users/shell/routes/registerUser';
import { registerLoginRoutes } from '@users/shell/routes/loginUser';
import { authMiddleware } from './middleware/authMiddleware';
import { registerGetCategoriesRoute } from '@categories/shell/routes/getCategories';
import { registerCreateCategoryRoute } from '@categories/shell/routes/createCategory';
import { registerGetProductsRoute } from '@products/shell/routes/getProducts';
import { registerGetProductByIdRoute } from '@products/shell/routes/getProductById';
import { registerCreateProductRoute } from '@products/shell/routes/createProduct';
import { registerPlaceOrderRoute } from '@orders/shell/routes/placeOrder';
import { registerGetOrdersRoute } from '@orders/shell/routes/getOrders';
import { registerGetOrderByIdRoute } from '@orders/shell/routes/getOrderById';
import { registerCancelOrderRoute } from '@orders/shell/routes/cancelOrder';
import { registerGetCartRoute } from '@cart/shell/routes/getCart';
import { registerAddToCartRoute } from '@cart/shell/routes/addToCart';
import { registerUpdateCartItemRoute } from '@cart/shell/routes/updateCartItem';
import { registerRemoveCartItemRoute } from '@cart/shell/routes/removeCartItem';
import { registerClearCartRoute } from '@cart/shell/routes/clearCart';
import { initDiagnosticsCollector } from './diagnostics/collector';
import { registerDiagnosticsRoute } from './routes/diagnostics';

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

  initDiagnosticsCollector();

  // Middleware to parse JSON bodies (side effect)
  //
  // Stos middleware musi być identyczny z apps/oop/src/app.ts. Wcześniej był tu
  // dodatkowo express.urlencoded({extended: true}) — warstwa wykonywana przy
  // każdym żądaniu, nieobecna w implementacji obiektowej i nieużywana przez
  // żaden z 16 endpointów (kontrakt przyjmuje wyłącznie ciała JSON).
  // Doliczała pracę wyłącznie stronie funkcyjnej, czyli w kierunku zgodnym
  // z hipotezami H2–H4 — usunięta 2026-08-25 przed ponownym pomiarem.
  app.use(express.json());

  // Define routes (side effect)
  app.get('/', (req: Request, res: Response) => {
    const message = pipe(
      getWelcomeMessage(),
      (msg) => formatMessage(msg)(O.none),
    );
    res.send(message);
  });

  // Register user routes
  registerUserRoutes(app);
  registerLoginRoutes(app);

  // Register category routes
  registerGetCategoriesRoute(app);
  registerCreateCategoryRoute(app);

  // Register product routes
  registerGetProductsRoute(app);
  registerGetProductByIdRoute(app);
  registerCreateProductRoute(app);

  // Register order routes
  registerPlaceOrderRoute(app);
  registerGetOrdersRoute(app);
  registerGetOrderByIdRoute(app);
  registerCancelOrderRoute(app);

  // Register cart routes
  registerGetCartRoute(app);
  registerAddToCartRoute(app);
  registerUpdateCartItemRoute(app);
  registerRemoveCartItemRoute(app);
  registerClearCartRoute(app);

  // Diagnostics — benchmark metrics (event loop lag, heap, GC)
  registerDiagnosticsRoute(app);

  // Protected test route — verifies JWT middleware works
  app.get('/api/me', authMiddleware, (req: Request, res: Response) => {
    res.json(createResponse('success', {userId: req.userId}, 'Authenticated'));
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
