import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {getCategories} from '@categories/core/usecases/getCategories';
import type {TDbCategory, TGetCategoriesEnv} from '@categories/core/types';

const category: TDbCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic devices',
  createdAt: new Date(),
};

describe('getCategories usecase', () => {
  test('returns list of categories', async () => {
    const env: TGetCategoriesEnv = {
      getAllCategories: () => TE.right([category]),
    };

    const result = await getCategories()(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(1);
      expect(result.right[0].name).toBe('Electronics');
    }
  });

  test('returns empty list when no categories', async () => {
    const env: TGetCategoriesEnv = {
      getAllCategories: () => TE.right([]),
    };

    const result = await getCategories()(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(0);
    }
  });

  test('propagates DB error', async () => {
    const env: TGetCategoriesEnv = {
      getAllCategories: () => TE.left(new Error('DB error')),
    };

    const result = await getCategories()(env)();
    expect(E.isLeft(result)).toBe(true);
  });
});
