import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {createProduct} from '@products/core/usecases/createProduct';
import {saveProduct} from '@products/shell/db/saveProduct';
import {categoryExistsInDb} from '@products/shell/db/categoryExists';
import {validateCreateProductRequest} from '@products/shell/validation/createProductDtoValidation';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';
import type {TProductToSave} from '@products/core/types';

export const createProductHandler = async (req: Request, res: Response): Promise<Response> => {
  const validationResult = validateCreateProductRequest(req.body);

  if (E.isLeft(validationResult)) {
    return res.status(400).json(createResponse('error', {
      type: 'ValidationError',
      details: validationResult.left.errors,
    }, 'Request body is not valid.'));
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).json(createResponse('error', {type: 'Database connection error'}, 'Could not connect to the database.'));
  }

  const env = {
    categoryExists: (id: number) => categoryExistsInDb(pool, id),
    saveProduct: (product: TProductToSave) => saveProduct(pool, product),
  };

  const result = await createProduct(validationResult.right)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        if (error.message === 'CategoryNotFound') {
          return res.status(422).json(createResponse('error', {type: 'UnprocessableEntity', details: null}, 'Category not found.'));
        }
        return res.status(500).json(createResponse('error', {type: 'InternalError', details: null}, error.message));
      },
      (product) => res.status(201).json(createResponse('success', product, 'Product created successfully')),
    ),
  );
};

export const registerCreateProductRoute = (app: Express): void => {
  app.post('/api/products', authMiddleware, createProductHandler);
};
