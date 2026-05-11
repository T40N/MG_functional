import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {cancelOrder} from '@orders/core/usecases/cancelOrder';
import {cancelOrderInDb} from '@orders/shell/db/cancelOrderInDb';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';

export const cancelOrderHandler = async (req: Request, res: Response): Promise<Response> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json(createResponse('error', {type: 'ValidationError', details: null}, 'Invalid order id.'));
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const env = {cancelOrder: (oid: number, uid: number) => cancelOrderInDb(pool, oid, uid)};
  const result = await cancelOrder(id, userId)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        if (error.message === 'OrderNotFound') {
          return res.status(404).json(createResponse('error', {type: 'NotFound', details: null}, 'Order not found.'));
        }
        if (error.message === 'OrderAlreadyCancelled') {
          return res.status(409).json(createResponse('error', {type: 'Conflict', details: null}, 'Order is already cancelled.'));
        }
        return res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message));
      },
      (order) => res.status(200).json(createResponse('success', order, 'Order cancelled. Stock has been restored.')),
    ),
  );
};

export const registerCancelOrderRoute = (app: Express): void => {
  app.patch('/api/orders/:id/cancel', authMiddleware, cancelOrderHandler);
};
