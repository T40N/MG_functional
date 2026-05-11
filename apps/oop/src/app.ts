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
import { authMiddleware } from './common/middleware/authMiddleware';
import { ApiResponse } from './common/utils/ApiResponse';

export function buildApp(pool: Pool): express.Application {
  const app = express();
  app.use(express.json());

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

  app.use(userController.router);
  app.use(categoryController.router);
  app.use(productController.router);

  // Protected test route — verifies JWT middleware works
  app.get('/api/me', authMiddleware, (req: Request, res: Response) => {
    res.json(ApiResponse.success({userId: req.userId}, 'Authenticated'));
  });

  return app;
}
