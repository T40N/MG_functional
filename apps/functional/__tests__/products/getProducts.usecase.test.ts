import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {getProducts} from '@products/core/usecases/getProducts';
import {getProductById} from '@products/core/usecases/getProductById';
import type {TDbProduct, TGetProductsEnv, TGetProductByIdEnv} from '@products/core/types';

const dbProduct: TDbProduct = {
  id: 1,
  name: 'Laptop',
  description: 'A great laptop',
  price: '999.99',
  stock: 10,
  categoryId: 1,
  createdAt: new Date(),
};

describe('getProducts usecase', () => {
  test('returns list of products', async () => {
    const env: TGetProductsEnv = {
      getProducts: () => TE.right([dbProduct]),
    };

    const result = await getProducts({})(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(1);
      expect(result.right[0].name).toBe('Laptop');
    }
  });

  test('returns empty list when no products', async () => {
    const env: TGetProductsEnv = {
      getProducts: () => TE.right([]),
    };

    const result = await getProducts({})(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toHaveLength(0);
    }
  });

  test('passes filter to env', async () => {
    const mockGetProducts = jest.fn(() => TE.right([dbProduct]));
    const env: TGetProductsEnv = {getProducts: mockGetProducts};

    await getProducts({categoryId: 1, search: 'laptop', page: 2, limit: 5})(env)();
    expect(mockGetProducts).toHaveBeenCalledWith({categoryId: 1, search: 'laptop', page: 2, limit: 5});
  });
});

describe('getProductById usecase', () => {
  test('returns product when found', async () => {
    const env: TGetProductByIdEnv = {
      getProductById: () => TE.right(dbProduct),
    };

    const result = await getProductById(1)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right?.name).toBe('Laptop');
    }
  });

  test('returns null when not found', async () => {
    const env: TGetProductByIdEnv = {
      getProductById: () => TE.right(null),
    };

    const result = await getProductById(999)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toBeNull();
    }
  });
});
