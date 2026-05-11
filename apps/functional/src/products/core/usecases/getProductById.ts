import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetProductByIdEnv, TGetProductByIdResult} from '@products/core/types';

export const getProductById = (
  id: number,
): RTE.ReaderTaskEither<TGetProductByIdEnv, Error, TGetProductByIdResult> =>
  (env) => env.getProductById(id);
