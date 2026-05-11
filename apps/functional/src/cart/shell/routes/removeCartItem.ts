import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {removeCartItem} from '@cart/core/usecases/removeCartItem';
import {removeCartItemFromDb} from '@cart/shell/db/removeCartItem';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const removeCartItemHandler = async (req: Request, res: Response): Promise<Response> => {
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    return res.status(400).json(createResponse('error', {type: 'ValidationError', details: null}, 'Invalid productId.'));
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {removeCartItem: (uid: number, pid: number) => removeCartItemFromDb(pool, uid, pid)};
  const result = await removeCartItem(userId, productId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      () => res.status(200).json(createResponse('success', null, 'Item removed from cart.')),
    ),
  );
};

export const registerRemoveCartItemRoute = (app: Express): void => {
  app.delete('/api/cart/items/:productId', authMiddleware, removeCartItemHandler);
};
