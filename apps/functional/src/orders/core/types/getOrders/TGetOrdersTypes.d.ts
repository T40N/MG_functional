import type * as TE from 'fp-ts/TaskEither';
import type {TOrderWithItems} from '../common/TOrderWithItems';

export type TGetOrdersEnv = {
  getOrders: (userId: number) => TE.TaskEither<Error, TOrderWithItems[]>;
};

export type TGetOrdersResult = TOrderWithItems[];
