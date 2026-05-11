import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TRemoveCartItemEnv} from '@cart/core/types';

export const removeCartItem = (
  userId: number,
  productId: number,
): RTE.ReaderTaskEither<TRemoveCartItemEnv, Error, void> =>
  (env) => env.removeCartItem(userId, productId);
