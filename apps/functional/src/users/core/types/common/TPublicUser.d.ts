import {TDbUser} from './TDbUser';

export type TPublicUser = Omit<TDbUser, 'password'>;
