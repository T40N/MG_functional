import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TPlaceOrderEnv, TPlaceOrderResult} from '@orders/core/types';

export const placeOrder = (userId: number): RTE.ReaderTaskEither<TPlaceOrderEnv, Error, TPlaceOrderResult> =>
  (env) => env.placeOrder(userId);
