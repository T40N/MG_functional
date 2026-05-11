import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import {createCategory} from '@categories/core/usecases/createCategory';
import {getCategoryByName} from '@categories/shell/db/getCategoryByName';
import {saveCategory} from '@categories/shell/db/saveCategory';
import {validateCreateCategoryRequest} from '@categories/shell/validation/createCategoryDtoValidation';
import {createResponse} from '@common/core/usecases/createResponse';
import {authMiddleware} from '@common/shell/middleware/authMiddleware';
import type {TCategoryToSave} from '@categories/core/types';

export const createCategoryHandler = async (req: Request, res: Response): Promise<Response> => {
  const validationResult = validateCreateCategoryRequest(req.body);

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
    getCategoryByName: (name: string) => getCategoryByName(pool, name),
    saveCategory: (category: TCategoryToSave) => saveCategory(pool, category),
  };

  const result = await createCategory(validationResult.right)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        const isConflict = error.message === 'CategoryAlreadyExists';
        const status = isConflict ? 409 : 500;
        const errorType = isConflict ? 'Conflict' : 'InternalError';
        const message = isConflict ? 'Category with this name already exists' : error.message;
        return res.status(status).json(createResponse('error', {type: errorType, details: null}, message));
      },
      (category) => res.status(201).json(createResponse('success', category, 'Category created successfully')),
    ),
  );
};

export const registerCreateCategoryRoute = (app: Express): void => {
  app.post('/api/categories', authMiddleware, createCategoryHandler);
};
