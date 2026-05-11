import type * as TE from 'fp-ts/TaskEither';
import type {TDbCategory} from '../common/TDbCategory';

export type TGetCategoriesEnv = {
  getAllCategories: () => TE.TaskEither<Error, TDbCategory[]>;
};

export type TGetCategoriesResult = TDbCategory[];
