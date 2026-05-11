import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {placeOrderInDb} from '@orders/shell/db/placeOrderInDb';
import {cancelOrderInDb} from '@orders/shell/db/cancelOrderInDb';
import {getOrdersFromDb} from '@orders/shell/db/getOrdersFromDb';
import {getOrderByIdFromDb} from '@orders/shell/db/getOrderByIdFromDb';
import type {TOrderWithItems, TDbOrder} from '@orders/core/types';
import jwt from 'jsonwebtoken';

jest.mock('@orders/shell/db/placeOrderInDb');
jest.mock('@orders/shell/db/cancelOrderInDb');
jest.mock('@orders/shell/db/getOrdersFromDb');
jest.mock('@orders/shell/db/getOrderByIdFromDb');

const mockedPlaceOrder = placeOrderInDb as jest.Mock<ReturnType<typeof placeOrderInDb>, [unknown, number]>;
const mockedCancelOrder = cancelOrderInDb as jest.Mock<ReturnType<typeof cancelOrderInDb>, [unknown, number, number]>;
const mockedGetOrders = getOrdersFromDb as jest.Mock<ReturnType<typeof getOrdersFromDb>, [unknown, number]>;
const mockedGetOrderById = getOrderByIdFromDb as jest.Mock<ReturnType<typeof getOrderByIdFromDb>, [unknown, number, number]>;

const orderItem = {id: 1, orderId: 1, productId: 1, quantity: 2, priceAtPurchase: '999.99', productName: 'Laptop'};
const order: TDbOrder = {id: 1, userId: 1, status: 'pending', totalPrice: '1999.98', createdAt: new Date()};
const orderWithItems: TOrderWithItems = {...order, items: [orderItem]};

const token = jwt.sign({userId: '1', email: 'test@test.com'}, 'dev-secret', {expiresIn: '1h'});
const auth = {Authorization: `Bearer ${token}`};

describe('POST /api/orders', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/orders');
    expect(res.status).toBe(401);
  });

  test('returns 422 when cart is empty', async () => {
    mockedPlaceOrder.mockReturnValue(TE.left(new Error('CartEmpty')));
    const res = await request(app).post('/api/orders').set(auth);
    expect(res.status).toBe(422);
    expect(res.body.error.type).toBe('CartEmpty');
  });

  test('returns 409 when insufficient stock at checkout', async () => {
    mockedPlaceOrder.mockReturnValue(TE.left(new Error('InsufficientStock')));
    const res = await request(app).post('/api/orders').set(auth);
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('InsufficientStock');
  });

  test('returns 201 with order on success', async () => {
    mockedPlaceOrder.mockReturnValue(TE.right(orderWithItems));
    const res = await request(app).post('/api/orders').set(auth);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totalPrice).toBe('1999.98');
  });
});

describe('GET /api/orders', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  test('returns 200 with list of orders', async () => {
    mockedGetOrders.mockReturnValue(TE.right([orderWithItems]));
    const res = await request(app).get('/api/orders').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].items).toHaveLength(1);
  });

  test('returns 200 with empty list', async () => {
    mockedGetOrders.mockReturnValue(TE.right([]));
    const res = await request(app).get('/api/orders').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/orders/:id', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 400 on invalid id', async () => {
    const res = await request(app).get('/api/orders/abc').set(auth);
    expect(res.status).toBe(400);
  });

  test('returns 404 when not found or not owner', async () => {
    mockedGetOrderById.mockReturnValue(TE.right(null));
    const res = await request(app).get('/api/orders/99').set(auth);
    expect(res.status).toBe(404);
  });

  test('returns 200 with order details', async () => {
    mockedGetOrderById.mockReturnValue(TE.right(orderWithItems));
    const res = await request(app).get('/api/orders/1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe('PATCH /api/orders/:id/cancel', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).patch('/api/orders/1/cancel');
    expect(res.status).toBe(401);
  });

  test('returns 404 when order not found', async () => {
    mockedCancelOrder.mockReturnValue(TE.left(new Error('OrderNotFound')));
    const res = await request(app).patch('/api/orders/99/cancel').set(auth);
    expect(res.status).toBe(404);
  });

  test('returns 409 when already cancelled', async () => {
    mockedCancelOrder.mockReturnValue(TE.left(new Error('OrderAlreadyCancelled')));
    const res = await request(app).patch('/api/orders/1/cancel').set(auth);
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('Conflict');
  });

  test('returns 200 with cancelled order', async () => {
    mockedCancelOrder.mockReturnValue(TE.right({...order, status: 'cancelled'}));
    const res = await request(app).patch('/api/orders/1/cancel').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});
