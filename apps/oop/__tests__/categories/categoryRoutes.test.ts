import request from 'supertest';
import jwt from 'jsonwebtoken';
import {buildApp} from '../../src/app';
import {CategoryRepository} from '../../src/categories/CategoryRepository';

jest.mock('../../src/categories/CategoryRepository');
jest.mock('jsonwebtoken');

const MockedCategoryRepository = CategoryRepository as jest.MockedClass<typeof CategoryRepository>;
const mockedJwtVerify = jwt.verify as unknown as jest.Mock;

const dbCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic devices',
  createdAt: new Date(),
};

const validToken = 'valid-token';

describe('GET /api/categories', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCategoryRepository.mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue([]),
      findByName: jest.fn(),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);
  });

  test('returns 200 with list of categories', async () => {
    MockedCategoryRepository.mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue([dbCategory]),
      findByName: jest.fn(),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Electronics');
  });

  test('returns 200 with empty list', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('POST /api/categories', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCategoryRepository.mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue([]),
      findByName: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/categories').send({name: 'Electronics'});
    expect(res.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
  });

  test('returns 409 when category already exists', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedCategoryRepository.mockImplementation(() => ({
      findAll: jest.fn(),
      findByName: jest.fn().mockResolvedValue(dbCategory),
      save: jest.fn(),
    } as any));
    app = buildApp({} as any);

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${validToken}`)
      .send({name: 'Electronics'});

    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('Conflict');
  });

  test('returns 201 on success', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedCategoryRepository.mockImplementation(() => ({
      findAll: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(dbCategory),
    } as any));
    app = buildApp({} as any);

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${validToken}`)
      .send({name: 'Electronics', description: 'Electronic devices'});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Electronics');
  });
});
