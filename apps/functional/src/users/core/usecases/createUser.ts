import {pipe} from 'fp-ts/function';
import * as RTE from 'fp-ts/ReaderTaskEither';
import * as TE from 'fp-ts/TaskEither';
import type {TCreateUserEnv, TCreateUserInput, TCreateUserResult, TDbUser, TPublicUser} from '@users/core/types';

const toPublicUser = ({password, ...rest}: TDbUser): TPublicUser => rest;

export const createUser = (
  input: TCreateUserInput,
): RTE.ReaderTaskEither<TCreateUserEnv, Error, TCreateUserResult> =>
  pipe(
    RTE.ask<TCreateUserEnv>(),
    RTE.chainW((env) =>
      pipe(
        env.getUserByEmail(input.email),
        TE.chain((existing) =>
          existing ? TE.left(new Error('UserAlreadyExists')) : TE.right(null),
        ),
        TE.chain(() => env.hashPassword(input.password)),
        TE.chain((hashedPassword) =>
          env.saveUser({
            email: input.email,
            password: hashedPassword,
            name: input.name,
            surname: input.surname,
          }),
        ),
        TE.chain((savedUser) =>
          pipe(
            env.createToken({userId: String(savedUser.id), email: savedUser.email}),
            TE.map((token) => ({
              user: toPublicUser(savedUser),
              token,
            })),
          ),
        ),
        RTE.fromTaskEither,
      ),
    ),
  );