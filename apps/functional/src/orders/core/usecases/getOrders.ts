import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetOrdersEnv, TGetOrdersResult} from '@orders/core/types';

export const getOrders = (userId: number): RTE.ReaderTaskEither<TGetOrdersEnv, Error, TGetOrdersResult> =>
  (env) => env.getOrders(userId);
