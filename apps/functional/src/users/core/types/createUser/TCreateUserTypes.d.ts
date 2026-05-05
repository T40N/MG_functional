import type * as TE from 'fp-ts/TaskEither';
import type {TDbUser} from '../common/TDbUser';
import type {TUserToSave} from '../common/TUserToSave';
import type {TPublicUser} from '../common/TPublicUser';

export type TCreateUserEnv = {
  getUserByEmail: (email: string) => TE.TaskEither<Error, TDbUser | null>;
  hashPassword: (password: string) => TE.TaskEither<Error, string>;
  saveUser: (userToSave: TUserToSave) => TE.TaskEither<Error, TDbUser>;
  createToken: (payload: {userId: string; email: string}) => TE.TaskEither<Error, string>;
};

export type TCreateUserResult = {
  user: TPublicUser;
  token: string;
};
