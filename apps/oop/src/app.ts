import express from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from './users/UserRepository';
import { UserService } from './users/UserService';
import { UserController } from './users/UserController';

export function buildApp(pool: Pool): express.Application {
  const app = express();
  app.use(express.json());

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

  app.use(userController.router);

  return app;
}
