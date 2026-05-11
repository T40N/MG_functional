import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {createProduct} from '@products/core/usecases/createProduct';
import type {TCreateProductEnv, TCreateProductInput, TDbProduct} from '@products/core/types';

const baseInput: TCreateProductInput = {
  name: 'Laptop',
  description: 'A great laptop',
  price: 999.99,
  stock: 10,
  categoryId: 1,
};

const dbProduct: TDbProduct = {
  id: 1,
  name: 'Laptop',
  description: 'A great laptop',
  price: '999.99',
  stock: 10,
  categoryId: 1,
  createdAt: new Date(),
};

describe('createProduct usecase', () => {
  test('returns CategoryNotFound when category does not exist', async () => {
    const env: TCreateProductEnv = {
      categoryExists: () => TE.right(false),
      saveProduct: () => TE.right(dbProduct),
    };

    const result = await createProduct(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe('CategoryNotFound');
    }
  });

  test('returns saved product on success with category', async () => {
    const env: TCreateProductEnv = {
      categoryExists: () => TE.right(true),
      saveProduct: () => TE.right(dbProduct),
    };

    const result = await createProduct(baseInput)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.name).toBe('Laptop');
      expect(result.right.price).toBe('999.99');
    }
  });

  test('skips category check when no categoryId provided', async () => {
    const categoryExists = jest.fn(() => TE.right(true));
    const env: TCreateProductEnv = {
      categoryExists,
      saveProduct: () => TE.right({...dbProduct, categoryId: null}),
    };

    const input = {...baseInput, categoryId: undefined};
    const result = await createProduct(input)(env)();
    expect(E.isRight(result)).toBe(true);
    expect(categoryExists).not.toHaveBeenCalled();
  });

  test('propagates DB error on save', async () => {
    const env: TCreateProductEnv = {
      categoryExists: () => TE.right(true),
      saveProduct: () => TE.left(new Error('DB error')),
    };

    const result = await createProduct(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
  });
});
