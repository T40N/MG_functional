import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetCartEnv, TGetCartResult} from '@cart/core/types';

export const getCart = (userId: number): RTE.ReaderTaskEither<TGetCartEnv, Error, TGetCartResult> =>
  (env) => env.getCartItems(userId);
