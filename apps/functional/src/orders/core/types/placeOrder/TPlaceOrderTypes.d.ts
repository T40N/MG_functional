import type * as TE from 'fp-ts/TaskEither';
import type {TOrderWithItems} from '../common/TOrderWithItems';

export type TPlaceOrderEnv = {
  placeOrder: (userId: number) => TE.TaskEither<Error, TOrderWithItems>;
};

export type TPlaceOrderResult = TOrderWithItems;
