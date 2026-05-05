import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {createUser} from '@users/core/usecases/createUser';
import type {TCreateUserEnv, TCreateUserInput, TDbUser} from '@users/core/types';

const baseInput: TCreateUserInput = {
  email: 'john@example.com',
  password: 'Password1',
  name: 'John',
  surname: 'Smith',
};

const dbUser: TDbUser = {
  id: '1',
  name: 'John',
  surname: 'Smith',
  email: 'john@example.com',
  password: 'hashed',
  createdAt: new Date(),
};

describe('createUser usecase', () => {
  test('returns conflict when user already exists', async () => {
    const env: TCreateUserEnv = {
      getUserByEmail: () => TE.right(dbUser),
      hashPassword: () => TE.right('hashed'),
      saveUser: () => TE.right(dbUser),
      createToken: () => TE.right('token'),
    };

    const result = await createUser(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe('UserAlreadyExists');
    }
  });

  test('returns user and token on success', async () => {
    const env: TCreateUserEnv = {
      getUserByEmail: () => TE.right(null),
      hashPassword: () => TE.right('hashed'),
      saveUser: () => TE.right(dbUser),
      createToken: () => TE.right('token'),
    };

    const result = await createUser(baseInput)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.token).toBe('token');
      expect(result.right.user.email).toBe(baseInput.email);
      expect((result.right.user as any).password).toBeUndefined();
    }
  });
});
