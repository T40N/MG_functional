import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {placeOrder} from '@orders/core/usecases/placeOrder';
import {placeOrderInDb} from '@orders/shell/db/placeOrderInDb';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const placeOrderHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {placeOrder: (uid: number) => placeOrderInDb(pool, uid)};
  const result = await placeOrder(userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        if (error.message === 'CartEmpty') {
          return res.status(422).json(createResponse('error', {type: 'CartEmpty', details: null}, 'Cart is empty or all reservations have expired.'));
        }
        if (error.message === 'InsufficientStock') {
          return res.status(409).json(createResponse('error', {type: 'InsufficientStock', details: null}, 'One or more products no longer have sufficient stock.'));
        }
        return res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message));
      },
      (order) => res.status(201).json(createResponse('success', order, 'Order placed successfully.')),
    ),
  );
};

export const registerPlaceOrderRoute = (app: Express): void => {
  app.post('/api/orders', authMiddleware, placeOrderHandler);
};
