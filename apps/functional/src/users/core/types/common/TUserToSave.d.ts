import {TDbUser} from './TDbUser';

export type TUserToSave = Omit<TDbUser, 'id' | 'createdAt' | 'client_number'>
