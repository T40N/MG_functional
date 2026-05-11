import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {clearCart} from '@cart/core/usecases/clearCart';
import {clearCartInDb} from '@cart/shell/db/clearCart';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const clearCartHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {clearCart: (uid: number) => clearCartInDb(pool, uid)};
  const result = await clearCart(userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      () => res.status(200).json(createResponse('success', null, 'Cart cleared.')),
    ),
  );
};

export const registerClearCartRoute = (app: Express): void => {
  app.delete('/api/cart', authMiddleware, clearCartHandler);
};
