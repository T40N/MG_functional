import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getProducts} from '@products/core/usecases/getProducts';
import {getProductsFromDb} from '@products/shell/db/getProducts';
import {createResponse} from '@common/core/usecases/createResponse';
import type {TGetProductsFilter} from '@products/core/types';

export const getProductsHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const filter: TGetProductsFilter = {
    categoryId: req.query.category_id ? parseInt(req.query.category_id as string, 10) : undefined,
    search: req.query.search as string | undefined,
    page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
  };

  const env = {
    getProducts: (f: TGetProductsFilter) => getProductsFromDb(pool, f),
  };

  const result = await getProducts(filter)(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (products) => res.status(200).json(createResponse('success', products, 'Products fetched successfully')),
    ),
  );
};

export const registerGetProductsRoute = (app: Express): void => {
  app.get('/api/products', getProductsHandler);
};
