import type * as TE from 'fp-ts/TaskEither';

export type TRemoveCartItemEnv = {
  removeCartItem: (userId: number, productId: number) => TE.TaskEither<Error, void>;
};
