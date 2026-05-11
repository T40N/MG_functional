import type * as TE from 'fp-ts/TaskEither';
import type {TDbCategory} from '../common/TDbCategory';
import type {TCategoryToSave} from '../common/TCategoryToSave';

export type TCreateCategoryEnv = {
  getCategoryByName: (name: string) => TE.TaskEither<Error, TDbCategory | null>;
  saveCategory: (category: TCategoryToSave) => TE.TaskEither<Error, TDbCategory>;
};

export type TCreateCategoryResult = TDbCategory;
