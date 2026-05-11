import type * as TE from 'fp-ts/TaskEither';
import type {TDbProduct} from '../common/TDbProduct';

export type TGetProductByIdEnv = {
  getProductById: (id: number) => TE.TaskEither<Error, TDbProduct | null>;
};

export type TGetProductByIdResult = TDbProduct | null;
