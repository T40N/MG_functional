import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../src/app';
import { UserRepository } from '../../src/users/UserRepository';

jest.mock('../../src/users/UserRepository');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const MockedUserRepository = UserRepository as jest.MockedClass<typeof UserRepository>;
const mockedBcryptHash = bcrypt.hash as unknown as jest.Mock;
const mockedBcryptCompare = bcrypt.compare as unknown as jest.Mock;
const mockedJwtSign = jwt.sign as unknown as jest.Mock;

const dbUser = {
  id: '1', name: 'Jane', surname: 'Doe', email: 'jane@example.com',
  password: 'hashed', created_at: new Date(),
};

describe('POST /api/users/register', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedUserRepository.mockImplementation(() => ({ findByEmail: jest.fn(), save: jest.fn() } as any));
    app = buildApp({} as any);
  });

  test('returns 403 on validation error', async () => {
    const res = await request(app).post('/api/users/register').send({});
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.type).toBe('ValidationError');
  });

  test('returns 409 when user already exists', async () => {
    MockedUserRepository.mockImplementation(() => ({
      findByEmail: jest.fn().mockResolvedValue(dbUser),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/users/register').send({
      name: 'Jane', surname: 'Doe', email: 'jane@example.com',
      password: 'Password1', confirm_password: 'Password1',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('Conflict');
  });

  test('returns 201 with user and token on success', async () => {
    MockedUserRepository.mockImplementation(() => ({
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(dbUser),
    } as any));
    mockedBcryptHash.mockResolvedValue('hashed');
    mockedJwtSign.mockReturnValue('mock-token');
    app = buildApp({} as any);

    const res = await request(app).post('/api/users/register').send({
      name: 'Jane', surname: 'Doe', email: 'jane@example.com',
      password: 'Password1', confirm_password: 'Password1',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('mock-token');
    expect(res.body.data.user.email).toBe('jane@example.com');
    expect(res.body.data.user.password).toBeUndefined();
  });
});

describe('POST /api/auth/login', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedUserRepository.mockImplementation(() => ({ findByEmail: jest.fn(), save: jest.fn() } as any));
    app = buildApp({} as any);
  });

  test('returns 400 on validation error', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
  });

  test('returns 401 on invalid credentials', async () => {
    MockedUserRepository.mockImplementation(() => ({
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com', password: 'Password1',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.type).toBe('Unauthorized');
  });

  test('returns 200 with user and token on success', async () => {
    MockedUserRepository.mockImplementation(() => ({
      findByEmail: jest.fn().mockResolvedValue(dbUser),
      save: jest.fn(),
    } as any));
    mockedBcryptCompare.mockResolvedValue(true);
    mockedJwtSign.mockReturnValue('mock-token');
    app = buildApp({} as any);

    const res = await request(app).post('/api/auth/login').send({
      email: 'jane@example.com', password: 'Password1',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('mock-token');
    expect(res.body.data.user.email).toBe('jane@example.com');
    expect(res.body.data.user.password).toBeUndefined();
  });
});
