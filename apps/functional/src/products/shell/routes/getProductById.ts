import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getProductById} from '@products/core/usecases/getProductById';
import {getProductByIdFromDb} from '@products/shell/db/getProductById';
import {createResponse} from '@common/core/usecases/createResponse';

export const getProductByIdHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json(createResponse('error', {type: 'ValidationError', details: null}, 'Invalid product id.'));
  }

  const env = {
    getProductById: (productId: number) => getProductByIdFromDb(pool, productId),
  };

  const result = await getProductById(id)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (product) =>
        product
          ? res.status(200).json(createResponse('success', product, 'Product fetched successfully'))
          : res.status(404).json(createResponse('error', {type: 'NotFound', details: null}, 'Product not found.')),
    ),
  );
};

export const registerGetProductByIdRoute = (app: Express): void => {
  app.get('/api/products/:id', getProductByIdHandler);
};
