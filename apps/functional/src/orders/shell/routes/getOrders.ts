import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getOrders} from '@orders/core/usecases/getOrders';
import {getOrdersFromDb} from '@orders/shell/db/getOrdersFromDb';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const getOrdersHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {getOrders: (uid: number) => getOrdersFromDb(pool, uid)};
  const result = await getOrders(userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (orders) => res.status(200).json(createResponse('success', orders, 'Orders fetched successfully.')),
    ),
  );
};

export const registerGetOrdersRoute = (app: Express): void => {
  app.get('/api/orders', authMiddleware, getOrdersHandler);
};
