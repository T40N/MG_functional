import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {upsertCartItem} from '@cart/core/usecases/upsertCartItem';
import type {TCartItemInput, TDbCartItem, TUpsertCartItemEnv} from '@cart/core/types';

const input: TCartItemInput = {userId: 1, productId: 1, quantity: 2};

const dbCartItem: TDbCartItem = {
  id: 1,
  userId: 1,
  productId: 1,
  quantity: 2,
  reservedAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  productName: 'Laptop',
  productPrice: '999.99',
};

describe('upsertCartItem usecase', () => {
  test('returns ProductNotFound when product does not exist', async () => {
    const env: TUpsertCartItemEnv = {
      getAvailableStock: () => TE.right(null),
      upsertCartItem: () => TE.right(dbCartItem),
    };

    const result = await upsertCartItem(input)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) expect(result.left.message).toBe('ProductNotFound');
  });

  test('returns InsufficientStock when not enough stock', async () => {
    const env: TUpsertCartItemEnv = {
      getAvailableStock: () => TE.right(1),
      upsertCartItem: () => TE.right(dbCartItem),
    };

    const result = await upsertCartItem({...input, quantity: 5})(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) expect(result.left.message).toBe('InsufficientStock');
  });

  test('returns cart item on success', async () => {
    const env: TUpsertCartItemEnv = {
      getAvailableStock: () => TE.right(10),
      upsertCartItem: () => TE.right(dbCartItem),
    };

    const result = await upsertCartItem(input)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.productId).toBe(1);
      expect(result.right.quantity).toBe(2);
      expect(result.right.productName).toBe('Laptop');
    }
  });

  test('allows user to update to exact available amount', async () => {
    const env: TUpsertCartItemEnv = {
      getAvailableStock: () => TE.right(3),
      upsertCartItem: () => TE.right({...dbCartItem, quantity: 3}),
    };

    const result = await upsertCartItem({...input, quantity: 3})(env)();
    expect(E.isRight(result)).toBe(true);
  });

  test('propagates DB error on upsert', async () => {
    const env: TUpsertCartItemEnv = {
      getAvailableStock: () => TE.right(10),
      upsertCartItem: () => TE.left(new Error('DB error')),
    };

    const result = await upsertCartItem(input)(env)();
    expect(E.isLeft(result)).toBe(true);
  });
});
