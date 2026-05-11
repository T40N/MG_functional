import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {getCartItems} from '@cart/shell/db/getCartItems';
import {getAvailableStock} from '@cart/shell/db/getAvailableStock';
import {upsertCartItemInDb} from '@cart/shell/db/upsertCartItem';
import {removeCartItemFromDb} from '@cart/shell/db/removeCartItem';
import {clearCartInDb} from '@cart/shell/db/clearCart';
import type {TDbCartItem} from '@cart/core/types';
import jwt from 'jsonwebtoken';

jest.mock('@cart/shell/db/getCartItems');
jest.mock('@cart/shell/db/getAvailableStock');
jest.mock('@cart/shell/db/upsertCartItem');
jest.mock('@cart/shell/db/removeCartItem');
jest.mock('@cart/shell/db/clearCart');

const mockedGetCartItems = getCartItems as jest.Mock<ReturnType<typeof getCartItems>, [unknown, number]>;
const mockedGetAvailableStock = getAvailableStock as jest.Mock<ReturnType<typeof getAvailableStock>, [unknown, number, number]>;
const mockedUpsertCartItem = upsertCartItemInDb as jest.Mock<ReturnType<typeof upsertCartItemInDb>, [unknown, unknown]>;
const mockedRemoveCartItem = removeCartItemFromDb as jest.Mock<ReturnType<typeof removeCartItemFromDb>, [unknown, number, number]>;
const mockedClearCart = clearCartInDb as jest.Mock<ReturnType<typeof clearCartInDb>, [unknown, number]>;

const cartItem: TDbCartItem = {
  id: 1,
  userId: 1,
  productId: 1,
  quantity: 2,
  reservedAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  productName: 'Laptop',
  productPrice: '999.99',
};

const token = jwt.sign({userId: '1', email: 'test@test.com'}, 'dev-secret', {expiresIn: '1h'});
const auth = {Authorization: `Bearer ${token}`};

describe('GET /api/cart', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  test('returns 200 with cart items', async () => {
    mockedGetCartItems.mockReturnValue(TE.right([cartItem]));
    const res = await request(app).get('/api/cart').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productName).toBe('Laptop');
  });

  test('returns 200 with empty cart', async () => {
    mockedGetCartItems.mockReturnValue(TE.right([]));
    const res = await request(app).get('/api/cart').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('POST /api/cart/items', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/cart/items').send({productId: 1, quantity: 1});
    expect(res.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    const res = await request(app).post('/api/cart/items').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('ValidationError');
  });

  test('returns 404 when product not found', async () => {
    mockedGetAvailableStock.mockReturnValue(TE.right(null));
    const res = await request(app).post('/api/cart/items').set(auth).send({productId: 99, quantity: 1});
    expect(res.status).toBe(404);
  });

  test('returns 409 when insufficient stock', async () => {
    mockedGetAvailableStock.mockReturnValue(TE.right(1));
    const res = await request(app).post('/api/cart/items').set(auth).send({productId: 1, quantity: 5});
    expect(res.status).toBe(409);
    expect(res.body.error.type).toBe('InsufficientStock');
  });

  test('returns 201 on success', async () => {
    mockedGetAvailableStock.mockReturnValue(TE.right(10));
    mockedUpsertCartItem.mockReturnValue(TE.right(cartItem));
    const res = await request(app).post('/api/cart/items').set(auth).send({productId: 1, quantity: 2});
    expect(res.status).toBe(201);
    expect(res.body.data.productName).toBe('Laptop');
  });
});

describe('PUT /api/cart/items/:productId', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 400 on invalid productId', async () => {
    const res = await request(app).put('/api/cart/items/abc').set(auth).send({quantity: 1});
    expect(res.status).toBe(400);
  });

  test('returns 409 when insufficient stock', async () => {
    mockedGetAvailableStock.mockReturnValue(TE.right(0));
    const res = await request(app).put('/api/cart/items/1').set(auth).send({quantity: 3});
    expect(res.status).toBe(409);
  });

  test('returns 200 on success', async () => {
    mockedGetAvailableStock.mockReturnValue(TE.right(10));
    mockedUpsertCartItem.mockReturnValue(TE.right({...cartItem, quantity: 5}));
    const res = await request(app).put('/api/cart/items/1').set(auth).send({quantity: 5});
    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe(5);
  });
});

describe('DELETE /api/cart/items/:productId', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 400 on invalid productId', async () => {
    const res = await request(app).delete('/api/cart/items/abc').set(auth);
    expect(res.status).toBe(400);
  });

  test('returns 200 on success', async () => {
    mockedRemoveCartItem.mockReturnValue(TE.right(undefined));
    const res = await request(app).delete('/api/cart/items/1').set(auth);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/cart', () => {
  beforeEach(() => { (app as any).dbPool = {}; jest.resetAllMocks(); });

  test('returns 401 without token', async () => {
    const res = await request(app).delete('/api/cart');
    expect(res.status).toBe(401);
  });

  test('returns 200 on success', async () => {
    mockedClearCart.mockReturnValue(TE.right(undefined));
    const res = await request(app).delete('/api/cart').set(auth);
    expect(res.status).toBe(200);
  });
});
