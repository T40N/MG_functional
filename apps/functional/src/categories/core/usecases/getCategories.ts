import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TGetCategoriesEnv, TGetCategoriesResult} from '@categories/core/types';

export const getCategories = (): RTE.ReaderTaskEither<TGetCategoriesEnv, Error, TGetCategoriesResult> =>
  (env) => env.getAllCategories();
