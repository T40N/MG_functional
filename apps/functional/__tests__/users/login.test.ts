import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {getUserByEmail} from '@users/shell/db/getUserByEmail';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.mock('@users/shell/db/getUserByEmail');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const mockedGetUserByEmail = getUserByEmail as jest.Mock<TE.TaskEither<Error, unknown>, [unknown, string]>;
const mockedBcryptCompare = bcrypt.compare as unknown as jest.Mock;
const mockedJwtSign = jwt.sign as unknown as jest.Mock;

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 400 on validation error', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.type).toBe('Validation error');
  });

  test('returns 401 on invalid credentials', async () => {
    mockedGetUserByEmail.mockReturnValue(TE.right(null));

    const response = await request(app).post('/api/auth/login').send({
      email: 'missing@example.com',
      password: 'Password1',
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.type).toBe('Unauthorized');
  });

  test('returns 200 with user and token on success', async () => {
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
    mockedBcryptCompare.mockResolvedValue(true);
    mockedJwtSign.mockReturnValue('mock-token');

    const response = await request(app).post('/api/auth/login').send({
      email: 'jane@example.com',
      password: 'Password1',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('jane@example.com');
    expect(response.body.data.user.password).toBeUndefined();
    expect(response.body.data.token).toBe('mock-token');
  });
});
