import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getOrderById} from '@orders/core/usecases/getOrderById';
import {getOrderByIdFromDb} from '@orders/shell/db/getOrderByIdFromDb';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const getOrderByIdHandler = async (req: Request, res: Response): Promise<Response> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json(createResponse('error', {type: 'ValidationError', details: null}, 'Invalid order id.'));
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {getOrderById: (oid: number, uid: number) => getOrderByIdFromDb(pool, oid, uid)};
  const result = await getOrderById(id, userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (order) =>
        order
          ? res.status(200).json(createResponse('success', order, 'Order fetched successfully.'))
          : res.status(404).json(createResponse('error', {type: 'NotFound', details: null}, 'Order not found.')),
    ),
  );
};

export const registerGetOrderByIdRoute = (app: Express): void => {
  app.get('/api/orders/:id', authMiddleware, getOrderByIdHandler);
};
