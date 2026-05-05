export type DbUser = {
  id: string;
  name: string;
  surname: string;
  email: string;
  password: string;
  createdAt: Date;
};

export type PublicUser = Omit<DbUser, 'password'>;

export type UserToSave = {
  name: string;
  surname: string;
  email: string;
  password: string;
};
