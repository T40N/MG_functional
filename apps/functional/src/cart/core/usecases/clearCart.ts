import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TClearCartEnv} from '@cart/core/types';

export const clearCart = (userId: number): RTE.ReaderTaskEither<TClearCartEnv, Error, void> =>
  (env) => env.clearCart(userId);
