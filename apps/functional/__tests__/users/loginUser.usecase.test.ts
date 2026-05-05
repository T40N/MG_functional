import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {loginUser} from '@users/core/usecases/loginUser';
import type {TDbUser, TLoginEnv, TLoginInput} from '@users/core/types';

const baseInput: TLoginInput = {
  email: 'jane@example.com',
  password: 'Password1',
};

const dbUser: TDbUser = {
  id: '1',
  name: 'Jane',
  surname: 'Doe',
  email: 'jane@example.com',
  password: 'hashed',
  createdAt: new Date(),
};

describe('loginUser usecase', () => {
  test('returns invalid credentials when user is missing', async () => {
    const env: TLoginEnv = {
      getUserByEmail: () => TE.right(null),
      comparePassword: () => TE.right(false),
      createToken: () => TE.right('mock-token'),
    };

    const result = await loginUser(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe('InvalidCredentials');
    }
  });

  test('returns invalid credentials when password does not match', async () => {
    const env: TLoginEnv = {
      getUserByEmail: () => TE.right(dbUser),
      comparePassword: () => TE.right(false),
      createToken: () => TE.right('mock-token'),
    };

    const result = await loginUser(baseInput)(env)();
    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe('InvalidCredentials');
    }
  });

  test('returns user and token on success', async () => {
    const env: TLoginEnv = {
      getUserByEmail: () => TE.right(dbUser),
      comparePassword: () => TE.right(true),
      createToken: () => TE.right('mock-token'),
    };

    const result = await loginUser(baseInput)(env)();
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.user.email).toBe(baseInput.email);
      expect((result.right.user as any).password).toBeUndefined();
      expect(result.right.token).toBe('mock-token');
    }
  });
});
