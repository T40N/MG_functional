import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {Pool} from 'pg';
import {executeQueryWithPool} from '@common/shell/database';

export const categoryExistsInDb = (pool: Pool, id: number): TE.TaskEither<Error, boolean> =>
  pipe(
    executeQueryWithPool<{exists: boolean}>(
      pool,
      'SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1) as exists',
      [id],
    ),
    TE.map((rows) => rows[0]?.exists ?? false),
  );
