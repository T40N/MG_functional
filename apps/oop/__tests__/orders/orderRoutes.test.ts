import request from 'supertest';
import jwt from 'jsonwebtoken';
import {buildApp} from '../../src/app';
import {OrderRepository} from '../../src/orders/OrderRepository';

jest.mock('../../src/orders/OrderRepository');
jest.mock('jsonwebtoken');

const MockedOrderRepository = OrderRepository as jest.MockedClass<typeof OrderRepository>;
const mockedJwtVerify = jwt.verify as unknown as jest.Mock;

const orderItem = {
  id: 1,
  orderId: 1,
  productId: 1,
  quantity: 2,
  priceAtPurchase: '999.99',
  productName: 'Laptop',
};

const order = {
  id: 1,
  userId: 1,
  status: 'pending',
  totalPrice: '1999.98',
  createdAt: new Date(),
};

const orderWithItems = {...order, items: [orderItem]};
const validToken = 'valid-token';

const defaultMockRepo = () => ({
  placeOrder: jest.fn().mockResolvedValue(orderWithItems),
  cancelOrder: jest.fn().mockResolvedValue({...order, status: 'cancelled'}),
  findByUser: jest.fn().mockResolvedValue([orderWithItems]),
  findById: jest.fn().mockResolvedValue(orderWithItems),
});

describe('POST /api/orders', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedOrderRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/orders');
    expect(res.status).toBe(401);
  });

  test('returns 422 when cart is empty', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      placeOrder: jest.fn().mockRejectedValue(new Error('CartEmpty')),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(422);
    expect(res.body.error.type).toBe('CartEmpty');
  });

  test('returns 409 when insufficient stock', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      placeOrder: jest.fn().mockRejectedValue(new Error('InsufficientStock')),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('InsufficientStock');
  });

  test('returns 201 with order on success', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe('GET /api/orders', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedOrderRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  test('returns 200 with list of orders', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].items).toHaveLength(1);
  });

  test('returns 200 with empty list', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      findByUser: jest.fn().mockResolvedValue([]),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/orders/:id', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedOrderRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
  });

  test('returns 400 on invalid id', async () => {
    const res = await request(app).get('/api/orders/abc').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
  });

  test('returns 404 when not found', async () => {
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      findById: jest.fn().mockResolvedValue(null),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).get('/api/orders/99').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 with order details', async () => {
    const res = await request(app).get('/api/orders/1').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe('PATCH /api/orders/:id/cancel', () => {
  let app: Express.Application;

  beforeEach(() => {
    jest.resetAllMocks();
    MockedOrderRepository.mockImplementation(() => defaultMockRepo() as any);
    app = buildApp({} as any);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).patch('/api/orders/1/cancel');
    expect(res.status).toBe(401);
  });

  test('returns 404 when order not found', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      cancelOrder: jest.fn().mockRejectedValue(new Error('OrderNotFound')),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).patch('/api/orders/99/cancel').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
  });

  test('returns 409 when already cancelled', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    MockedOrderRepository.mockImplementation(() => ({
      ...defaultMockRepo(),
      cancelOrder: jest.fn().mockRejectedValue(new Error('OrderAlreadyCancelled')),
    } as any));
    app = buildApp({} as any);

    const res = await request(app).patch('/api/orders/1/cancel').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('Conflict');
  });

  test('returns 200 with cancelled order', async () => {
    mockedJwtVerify.mockReturnValue({userId: '1', email: 'test@test.com'});
    const res = await request(app).patch('/api/orders/1/cancel').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});
