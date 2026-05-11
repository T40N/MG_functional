import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {getCategories} from '@categories/core/usecases/getCategories';
import {getAllCategories} from '@categories/shell/db/getAllCategories';
import {createResponse} from '@common/core/usecases/createResponse';

export const getCategoriesHandler = async (req: Request, res: Response): Promise<Response> => {
  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const env = {
    getAllCategories: () => getAllCategories(pool),
  };

  const result = await getCategories()(env)();

  return pipe(
    result,
    E.fold(
      (error) => res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message)),
      (categories) => res.status(200).json(createResponse('success', categories, 'Categories fetched successfully')),
    ),
  );
};

export const registerGetCategoriesRoute = (app: Express): void => {
  app.get('/api/categories', getCategoriesHandler);
};
