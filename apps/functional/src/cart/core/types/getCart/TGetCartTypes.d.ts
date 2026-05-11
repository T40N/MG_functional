import type * as TE from 'fp-ts/TaskEither';
import type {TDbCartItem} from '../common/TDbCartItem';

export type TGetCartEnv = {
  getCartItems: (userId: number) => TE.TaskEither<Error, TDbCartItem[]>;
};

export type TGetCartResult = TDbCartItem[];
