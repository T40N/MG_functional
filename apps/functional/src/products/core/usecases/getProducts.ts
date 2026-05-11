import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetProductsEnv, TGetProductsFilter, TGetProductsResult} from '@products/core/types';

export const getProducts = (
  filter: TGetProductsFilter,
): RTE.ReaderTaskEither<TGetProductsEnv, Error, TGetProductsResult> =>
  (env) => env.getProducts(filter);
