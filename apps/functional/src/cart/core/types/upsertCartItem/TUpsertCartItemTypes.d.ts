import type * as TE from 'fp-ts/TaskEither';
import type {TDbCartItem} from '../common/TDbCartItem';
import type {TCartItemInput} from '../common/TCartItemInput';

export type TUpsertCartItemEnv = {
  getAvailableStock: (productId: number, excludeUserId: number) => TE.TaskEither<Error, number | null>;
  upsertCartItem: (input: TCartItemInput) => TE.TaskEither<Error, TDbCartItem>;
};

export type TUpsertCartItemResult = TDbCartItem;
