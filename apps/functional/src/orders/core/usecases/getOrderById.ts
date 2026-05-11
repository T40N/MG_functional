import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetOrderByIdEnv, TGetOrderByIdResult} from '@orders/core/types';

export const getOrderById = (
  orderId: number,
  userId: number,
): RTE.ReaderTaskEither<TGetOrderByIdEnv, Error, TGetOrderByIdResult> =>
  (env) => env.getOrderById(orderId, userId);
