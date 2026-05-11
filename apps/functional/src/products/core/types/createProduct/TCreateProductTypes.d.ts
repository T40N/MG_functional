import type * as TE from 'fp-ts/TaskEither';
import type {TDbProduct} from '../common/TDbProduct';
import type {TProductToSave} from '../common/TProductToSave';

export type TCreateProductEnv = {
  categoryExists: (id: number) => TE.TaskEither<Error, boolean>;
  saveProduct: (product: TProductToSave) => TE.TaskEither<Error, TDbProduct>;
};

export type TCreateProductResult = TDbProduct;
