import {pipe} from 'fp-ts/function';
import * as RTE from 'fp-ts/ReaderTaskEither';
import * as TE from 'fp-ts/TaskEither';
import type {TCreateProductEnv, TCreateProductInput, TCreateProductResult} from '@products/core/types';

export const createProduct = (
  input: TCreateProductInput,
): RTE.ReaderTaskEither<TCreateProductEnv, Error, TCreateProductResult> =>
  pipe(
    RTE.ask<TCreateProductEnv>(),
    RTE.chainW((env) =>
      pipe(
        input.categoryId != null
          ? pipe(
            env.categoryExists(input.categoryId),
            TE.chain((exists) =>
              exists ? TE.right(null) : TE.left(new Error('CategoryNotFound')),
            ),
          )
          : TE.right(null),
        TE.chain(() =>
          env.saveProduct({
            name: input.name,
            description: input.description,
            price: input.price,
            stock: input.stock,
            categoryId: input.categoryId,
          }),
        ),
        RTE.fromTaskEither,
      ),
    ),
  );
