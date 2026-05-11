import type * as TE from 'fp-ts/TaskEither';

export type TClearCartEnv = {
  clearCart: (userId: number) => TE.TaskEither<Error, void>;
};
