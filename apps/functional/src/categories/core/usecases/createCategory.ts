import {pipe} from 'fp-ts/function';
import * as RTE from 'fp-ts/ReaderTaskEither';
import * as TE from 'fp-ts/TaskEither';
import type {TCreateCategoryEnv, TCreateCategoryInput, TCreateCategoryResult} from '@categories/core/types';

export const createCategory = (
  input: TCreateCategoryInput,
): RTE.ReaderTaskEither<TCreateCategoryEnv, Error, TCreateCategoryResult> =>
  pipe(
    RTE.ask<TCreateCategoryEnv>(),
    RTE.chainW((env) =>
      pipe(
        env.getCategoryByName(input.name),
        TE.chain((existing) =>
          existing ? TE.left(new Error('CategoryAlreadyExists')) : TE.right(null),
        ),
        TE.chain(() => env.saveCategory({name: input.name, description: input.description})),
        RTE.fromTaskEither,
      ),
    ),
  );
