import {pipe} from 'fp-ts/function';
import * as RTE from 'fp-ts/ReaderTaskEither';
import * as TE from 'fp-ts/TaskEither';
import type {TCartItemInput, TUpsertCartItemEnv, TUpsertCartItemResult} from '@cart/core/types';

export const upsertCartItem = (
  input: TCartItemInput,
): RTE.ReaderTaskEither<TUpsertCartItemEnv, Error, TUpsertCartItemResult> =>
  pipe(
    RTE.ask<TUpsertCartItemEnv>(),
    RTE.chainW((env) =>
      pipe(
        env.getAvailableStock(input.productId, input.userId),
        TE.chain((available) => {
          if (available === null) return TE.left(new Error('ProductNotFound'));
          if (available < input.quantity) return TE.left(new Error('InsufficientStock'));
          return TE.right(null);
        }),
        TE.chain(() => env.upsertCartItem(input)),
        RTE.fromTaskEither,
      ),
    ),
  );
