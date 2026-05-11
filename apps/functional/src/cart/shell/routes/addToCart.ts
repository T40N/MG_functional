import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {upsertCartItem} from '@cart/core/usecases/upsertCartItem';
import {getAvailableStock} from '@cart/shell/db/getAvailableStock';
import {upsertCartItemInDb} from '@cart/shell/db/upsertCartItem';
import {validateAddToCartRequest} from '@cart/shell/validation/cartDtoValidation';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';
import type {TCartItemInput} from '@cart/core/types';

export const addToCartHandler = async (req: Request, res: Response): Promise<Response> => {
  const validationResult = validateAddToCartRequest(req.body);
  if (E.isLeft(validationResult)) {
    return res.status(400).json(createResponse('error', {type: 'ValidationError', details: validationResult.left.errors}, 'Request body is not valid.'));
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const userId = parseInt(req.userId!, 10);
  const input: TCartItemInput = {userId, ...validationResult.right};
  const env = {
    getAvailableStock: (productId: number, excludeUserId: number) => getAvailableStock(pool, productId, excludeUserId),
    upsertCartItem: (i: TCartItemInput) => upsertCartItemInDb(pool, i),
  };

  const result = await upsertCartItem(input)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        if (error.message === 'ProductNotFound') {
          return res.status(404).json(createResponse('error', {type: 'NotFound', details: null}, 'Product not found.'));
        }
        if (error.message === 'InsufficientStock') {
          return res.status(409).json(createResponse('error', {type: 'InsufficientStock', details: null}, 'Not enough stock available.'));
        }
        return res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message));
      },
      (item) => res.status(201).json(createResponse('success', item, 'Item added to cart. Stock reserved for 15 minutes.')),
    ),
  );
};

export const registerAddToCartRoute = (app: Express): void => {
  app.post('/api/cart/items', authMiddleware, addToCartHandler);
};
