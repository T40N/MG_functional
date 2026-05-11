import type * as TE from 'fp-ts/TaskEither';
import type {TDbProduct} from '../common/TDbProduct';

export type TGetProductsFilter = {
  categoryId?: number;
  search?: string;
  page?: number;
  limit?: number;
};

export type TGetProductsEnv = {
  getProducts: (filter: TGetProductsFilter) => TE.TaskEither<Error, TDbProduct[]>;
};

export type TGetProductsResult = TDbProduct[];
