import {pipe} from 'fp-ts/function';
import * as RTE from 'fp-ts/ReaderTaskEither';
import type {TDbUser, TLoginEnv, TLoginInput, TLoginResult, TPublicUser} from '@users/core/types';
import * as TE from 'fp-ts/TaskEither';

const toPublicUser = ({password, ...rest}: TDbUser): TPublicUser => rest;

export const loginUser = (
  input: TLoginInput,
): RTE.ReaderTaskEither<TLoginEnv, Error, TLoginResult> =>
  pipe(
    RTE.ask<TLoginEnv>(),
    RTE.chainW((env) =>
      pipe(
        env.getUserByEmail(input.email),
        TE.chain((user) =>
          user
            ? pipe(
              env.comparePassword(input.password, user.password),
              TE.chain((isValid) =>
                isValid ? TE.right(user) : TE.left(new Error('InvalidCredentials')),
              ),
            )
            : TE.left(new Error('InvalidCredentials')),
        ),
        TE.chain((user) =>
          pipe(
            env.createToken({userId: String(user.id), email: user.email}),
            TE.map((token) => ({user: toPublicUser(user), token})),
          ),
        ),
        RTE.fromTaskEither,
      ),
    ),
  );
