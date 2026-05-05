import * as E from 'fp-ts/Either';
import type {ZodError, ZodSchema} from 'zod';

export const validate = <T>(schema: ZodSchema<T>) =>
  (data: unknown): E.Either<ZodError, T> =>
    E.tryCatch(
      () => schema.parse(data),
      (e) => e as ZodError,
    );