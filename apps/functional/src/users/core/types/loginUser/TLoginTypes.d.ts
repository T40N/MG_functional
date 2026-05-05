import type * as TE from 'fp-ts/TaskEither';
import type {TDbUser} from '../common/TDbUser';
import type {TPublicUser} from '../common/TPublicUser';

export type TLoginEnv = {
  getUserByEmail: (email: string) => TE.TaskEither<Error, TDbUser | null>;
  comparePassword: (plain: string, hash: string) => TE.TaskEither<Error, boolean>;
  createToken: (payload: {userId: string; email: string}) => TE.TaskEither<Error, string>;
};

export type TLoginResult = {
  user: TPublicUser;
  token: string;
};
