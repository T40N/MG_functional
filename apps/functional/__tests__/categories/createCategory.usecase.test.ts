import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {createCategory} from '@categories/core/usecases/createCategory';
import type {TCreateCategoryEnv, TCreateCategoryInput, TDbCategory} from '@categories/core/types';

const baseInput: TCreateCategoryInput = {
  name: 'Electronics',
  description: 'Electronic devices',
};

const dbCategory: TDbCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic devices',
  createdAt: new Date(),
};

describe('createCategory usecase', () => {
  test('returns conflict when category already exists', async () => {
    const env: TCreateCategoryEnv = {
      getCategoryByName: () => TE.right(dbCategory),
      saveCategory: () => TE.right(dbCategory),
    };

    const result = await createCategory(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe('CategoryAlreadyExists');
    }
  });

  test('returns saved category on success', async () => {
    const env: TCreateCategoryEnv = {
      getCategoryByName: () => TE.right(null),
      saveCategory: () => TE.right(dbCategory),
    };

    const result = await createCategory(baseInput)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.name).toBe('Electronics');
      expect(result.right.id).toBe(1);
    }
  });

  test('propagates DB error on save', async () => {
    const env: TCreateCategoryEnv = {
      getCategoryByName: () => TE.right(null),
      saveCategory: () => TE.left(new Error('DB error')),
    };

    const result = await createCategory(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
  });
});
