export type DbUser = {
  id: string;
  name: string;
  surname: string;
  email: string;
  password: string;
  created_at: Date;
};

export type PublicUser = Omit<DbUser, 'password'>;

export type UserToSave = {
  name: string;
  surname: string;
  email: string;
  password: string;
};
