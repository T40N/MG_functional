import type * as TE from 'fp-ts/TaskEither';
import type {TDbOrder} from '../common/TDbOrder';

export type TCancelOrderEnv = {
  cancelOrder: (orderId: number, userId: number) => TE.TaskEither<Error, TDbOrder>;
};

export type TCancelOrderResult = TDbOrder;
