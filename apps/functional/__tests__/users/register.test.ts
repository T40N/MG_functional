import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {getUserByEmail} from '@users/shell/db/getUserByEmail';
import {saveUser} from '@users/shell/db/saveUser';
import type {TDbUser} from '@users/core/types';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.mock('@users/shell/db/getUserByEmail');
jest.mock('@users/shell/db/saveUser');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const mockedGetUserByEmail = getUserByEmail as jest.Mock<
  TE.TaskEither<Error, TDbUser | null>,
  [unknown, string]
>;
const mockedSaveUser = saveUser as jest.Mock<ReturnType<typeof saveUser>, [unknown, unknown]>;
const mockedBcryptHash = bcrypt.hash as unknown as jest.Mock;
const mockedJwtSign = jwt.sign as unknown as jest.Mock;

describe('POST /api/users/register', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 403 on validation error', async () => {
    const response = await request(app).post('/api/users/register').send({});

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.type).toBe('Validation error');
  });

  test('returns 409 when user already exists', async () => {
    mockedGetUserByEmail.mockReturnValue(
      TE.right({
        id: '1',
        name: 'Jane',
        surname: 'Doe',
        email: 'jane@example.com',
        password: 'hashed',
        createdAt: new Date(),
      }),
    );

    const response = await request(app).post('/api/users/register').send({
      email: 'jane@example.com',
      password: 'Password1',
      confirm_password: 'Password1',
      name: 'Jane',
      surname: 'Doe',
    });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.type).toBe('Conflict');
  });

  test('returns 201 and token on success', async () => {
    mockedGetUserByEmail.mockReturnValue(TE.right(null));
    mockedBcryptHash.mockResolvedValue('hashed');
    mockedSaveUser.mockReturnValue(
      TE.right({
        id: '2',
        name: 'John',
        surname: 'Smith',
        email: 'john@example.com',
        password: 'hashed',
        createdAt: new Date(),
      }),
    );
    mockedJwtSign.mockReturnValue('token');

    const response = await request(app).post('/api/users/register').send({
      email: 'john@example.com',
      password: 'Password1',
      confirm_password: 'Password1',
      name: 'John',
      surname: 'Smith',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBe('token');
    expect(response.body.data.user.email).toBe('john@example.com');
    expect(response.body.data.user.password).toBeUndefined();
  });
});
