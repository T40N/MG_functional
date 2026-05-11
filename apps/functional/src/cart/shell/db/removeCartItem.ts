import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';

export const removeCartItemFromDb = (pool: Pool, userId: number, productId: number): TE.TaskEither<Error, void> =>
  pipe(
    executeQueryWithPool(
      pool,
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    ),
    TE.map(() => undefined),
  );
