import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from './users/UserRepository';
import { UserService } from './users/UserService';
import { UserController } from './users/UserController';
import { CategoryRepository } from './categories/CategoryRepository';
import { CategoryService } from './categories/CategoryService';
import { CategoryController } from './categories/CategoryController';
import { ProductRepository } from './products/ProductRepository';
import { ProductService } from './products/ProductService';
import { ProductController } from './products/ProductController';
import { CartRepository } from './cart/CartRepository';
import { CartService } from './cart/CartService';
import { CartController } from './cart/CartController';
import { OrderRepository } from './orders/OrderRepository';
import { OrderService } from './orders/OrderService';
import { OrderController } from './orders/OrderController';
import { authMiddleware } from './common/middleware/authMiddleware';
import { ApiResponse } from './common/utils/ApiResponse';
import { initDiagnosticsCollector } from './common/diagnostics/DiagnosticsCollector';
import { DiagnosticsController } from './common/diagnostics/DiagnosticsController';

export function buildApp(pool: Pool): express.Application {
  const app = express();
  app.use(express.json());

  initDiagnosticsCollector();

  app.get('/', (_req: Request, res: Response) => {
    res.send('OOP app is running.');
  });

  const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret';

  const userRepository = new UserRepository(pool);
  const passwordService = {
    hash: (plain: string) => bcrypt.hash(plain, 10),
    compare: (plain: string, hashed: string) => bcrypt.compare(plain, hashed),
  };
  const tokenService = {
    sign: (payload: { userId: string; email: string }) =>
      jwt.sign(payload, jwtSecret, { expiresIn: '1h' }) as string,
  };

  const userService = new UserService(userRepository, passwordService, tokenService);
  const userController = new UserController(userService);

  const categoryRepository = new CategoryRepository(pool);
  const categoryService = new CategoryService(categoryRepository);
  const categoryController = new CategoryController(categoryService);

  const productRepository = new ProductRepository(pool);
  const productService = new ProductService(productRepository);
  const productController = new ProductController(productService);

  const cartRepository = new CartRepository(pool);
  const cartService = new CartService(cartRepository);
  const cartController = new CartController(cartService);

  const orderRepository = new OrderRepository(pool);
  const orderService = new OrderService(orderRepository);
  const orderController = new OrderController(orderService);

  app.use(userController.router);
  app.use(categoryController.router);
  app.use(productController.router);
  app.use(cartController.router);
  app.use(orderController.router);

  // Diagnostics — benchmark metrics (event loop lag, heap, GC)
  const diagnosticsController = new DiagnosticsController();
  app.use(diagnosticsController.router);

  // Protected test route — verifies JWT middleware works
  app.get('/api/me', authMiddleware, (req: Request, res: Response) => {
    res.json(ApiResponse.success({userId: req.userId}, 'Authenticated'));
  });

  return app;
}
