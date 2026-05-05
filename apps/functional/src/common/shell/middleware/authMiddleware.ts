import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import {createResponse} from '@common/core/usecases/createResponse';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(createResponse('error', {type: 'Unauthorized'}, 'Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET ?? 'dev-secret';

  try {
    const payload = jwt.verify(token, secret) as {userId: string; email: string};
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json(createResponse('error', {type: 'Unauthorized'}, 'Invalid or expired token'));
  }
};
