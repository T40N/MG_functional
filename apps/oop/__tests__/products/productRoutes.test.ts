import request from 'supertest';
import jwt from 'jsonwebtoken';
import {buildApp} from '../../src/app';
import {ProductRepository} from '../../src/products/ProductRepository';

jest.mock('../../src/products/ProductRepository');
jest.mock('jsonwebtoken');

const MockedProductRepository = ProductRepository as jest.MockedClass<typeof ProductRepository>;
const mockedJwtVerify = jwt.verify as unknown as jest.Mock;

const dbProduct = {
  id: 1,
  name: 'Laptop',
  description: 'A great laptop',
  price: '999.99',
  stock: 10,
  categoryId: 1,
  createdAt: new Date(),
};

const validToken = 'valid-token';

const defaultMockRepo = () => ({
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  categoryExists: jest.fn().mockResolvedValue(false),
  save: jest.fn(),
});

describe('GET /api/products', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedProductRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 200 with list of products', async () => {
    MockedProductRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      findAll: jest.fn().mockResolvedValue([dbProduct]),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Laptop');
  });

  test('returns 200 with empty list', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/products/:id', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedProductRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 200 with product', async () => {
    MockedProductRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      findById: jest.fn().mockResolvedValue(dbProduct),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/products/1');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Laptop');
  });

  test('returns 404 when not found', async () => {
    const res = await request(app).get('/api/products/999');
    expect(res.status).toBe(404);
    expect(res.body.error.type).toBe('NotFound');
  });

  test('returns 400 on invalid id', async () => {
    const res = await request(app).get('/api/products/abc');
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
  });
});

describe('POST /api/products', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedProductRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/products').send({name: 'Laptop', price: 999, stock: 10});
    expect(res.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
  });

  test('returns 422 when category not found', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({name: 'Laptop', price: 999.99, stock: 10, categoryId: 99});
    expect(res.status).toBe(422);
    expect(res.body.error.type).toBe('UnprocessableEntity');
  });

  test('returns 201 on success without category', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedProductRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      save: jest.fn().mockResolvedValue({...dbProduct, categoryId: null}),
    } as any));
    app = buildApp({} as any);

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({name: 'Laptop', price: 999.99, stock: 10});
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Laptop');
  });

  test('returns 201 on success with category', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedProductRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      categoryExists: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(dbProduct),
    } as any));
    app = buildApp({} as any);

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({name: 'Laptop', price: 999.99, stock: 10, categoryId: 1});
    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBe(1);
  });
});
