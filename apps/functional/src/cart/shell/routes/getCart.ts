import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getCart} from '@cart/core/usecases/getCart';
import {getCartItems} from '@cart/shell/db/getCartItems';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const getCartHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {getCartItems: (id: number) => getCartItems(pool, id)};
  const result = await getCart(userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (items) => res.status(200).json(createResponse('success', items, 'Cart fetched successfully')),
    ),
  );
};

export const registerGetCartRoute = (app: Express): void => {
  app.get('/api/cart', authMiddleware, getCartHandler);
};
