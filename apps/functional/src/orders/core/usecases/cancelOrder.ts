import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TCancelOrderEnv, TCancelOrderResult} from '@orders/core/types';

export const cancelOrder = (
  orderId: number,
  userId: number,
): RTE.ReaderTaskEither<TCancelOrderEnv, Error, TCancelOrderResult> =>
  (env) => env.cancelOrder(orderId, userId);
