import request from 'supertest';
import jwt from 'jsonwebtoken';
import {buildApp} from '../../src/app';
import {CartRepository} from '../../src/cart/CartRepository';

jest.mock('../../src/cart/CartRepository');
jest.mock('jsonwebtoken');

const MockedCartRepository = CartRepository as jest.MockedClass<typeof CartRepository>;
const mockedJwtVerify = jwt.verify as unknown as jest.Mock;

const cartItem = {
  id: 1, userId: 1, productId: 1, quantity: 2,
  reservedAt: new Date(), expiresAt: new Date(Date.now() + 900000),
  productName: 'Laptop', productPrice: '999.99',
};

const validToken = 'valid-token';

const defaultMockRepo = () => ({
  getCartItems: jest.fn().mockResolvedValue([]),
  getAvailableStock: jest.fn().mockResolvedValue(10),
  upsertCartItem: jest.fn().mockResolvedValue(cartItem),
  removeCartItem: jest.fn().mockResolvedValue(undefined),
  clearCart: jest.fn().mockResolvedValue(undefined),
});

describe('GET /api/cart', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCartRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  test('returns 200 with cart items', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedCartRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      getCartItems: jest.fn().mockResolvedValue([cartItem]),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productName).toBe('Laptop');
  });
});

describe('POST /api/cart/items', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCartRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/cart/items').send({productId: 1, quantity: 1});
    expect(res.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${validToken}`).send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when product not found', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedCartRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      getAvailableStock: jest.fn().mockResolvedValue(null),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${validToken}`).send({productId: 99, quantity: 1});
    expect(res.status).toBe(404);
  });

  test('returns 409 when insufficient stock', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedCartRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      getAvailableStock: jest.fn().mockResolvedValue(1),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${validToken}`).send({productId: 1, quantity: 5});
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('InsufficientStock');
  });

  test('returns 201 on success', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).post('/api/cart/items').set('Authorization', `Bearer ${validToken}`).send({productId: 1, quantity: 2});
    expect(res.status).toBe(201);
    expect(res.body.data.productName).toBe('Laptop');
  });
});

describe('PUT /api/cart/items/:productId', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCartRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
  });

  test('returns 400 on invalid productId', async () => {
    const res = await request(app).put('/api/cart/items/abc').set('Authorization', `Bearer ${validToken}`).send({quantity: 1});
    expect(res.status).toBe(400);
  });

  test('returns 409 when insufficient stock', async () => {
    MockedCartRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      getAvailableStock: jest.fn().mockResolvedValue(0),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).put('/api/cart/items/1').set('Authorization', `Bearer ${validToken}`).send({quantity: 3});
    expect(res.status).toBe(409);
  });

  test('returns 200 on success', async () => {
    const res = await request(app).put('/api/cart/items/1').set('Authorization', `Bearer ${validToken}`).send({quantity: 2});
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/cart/items/:productId', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCartRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
  });

  test('returns 400 on invalid productId', async () => {
    const res = await request(app).delete('/api/cart/items/abc').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
  });

  test('returns 200 on success', async () => {
    const res = await request(app).delete('/api/cart/items/1').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/cart', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedCartRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).delete('/api/cart');
    expect(res.status).toBe(401);
  });

  test('returns 200 on success', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).delete('/api/cart').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
  });
});
