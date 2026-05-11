import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';

export const clearCartInDb = (pool: Pool, userId: number): TE.TaskEither<Error, void> =>
  pipe(
    executeQueryWithPool(
      pool,
      'DELETE FROM cart_items WHERE user_id = $1',
      [userId],
    ),
    TE.map(() => undefined),
  );
