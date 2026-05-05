import { Request, Response, Router } from 'express';
import { ApiResponse } from '@common/utils/ApiResponse';
import { createUserSchema, loginSchema } from './validators/userValidators';
import type { UserService } from './UserService';

export class UserController {
  router = Router();

  constructor(private userService: UserService) {
    this.router.post('/api/users/register', this.register);
    this.router.post('/api/auth/login', this.login);
  }

  private register = async (req: Request, res: Response): Promise<void> => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(403).json(ApiResponse.error('ValidationError', 'Request body is not valid registration.', parsed.error.errors));
      return;
    }

    try {
      const result = await this.userService.register(parsed.data);
      res.status(201).json(ApiResponse.success(result, 'User created successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'UserAlreadyExists') {
        res.status(409).json(ApiResponse.error('Conflict', 'User with this email already exists'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };

  private login = async (req: Request, res: Response): Promise<void> => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Request body is not valid login.', parsed.error.errors));
      return;
    }

    try {
      const result = await this.userService.login(parsed.data);
      res.status(200).json(ApiResponse.success(result, 'Login successful'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'InvalidCredentials') {
        res.status(401).json(ApiResponse.error('Unauthorized', 'Invalid email or password'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };
}
