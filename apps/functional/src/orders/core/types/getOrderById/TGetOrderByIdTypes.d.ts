import type * as TE from 'fp-ts/TaskEither';
import type {TOrderWithItems} from '../common/TOrderWithItems';

export type TGetOrderByIdEnv = {
  getOrderById: (orderId: number, userId: number) => TE.TaskEither<Error, TOrderWithItems | null>;
};

export type TGetOrderByIdResult = TOrderWithItems | null;
