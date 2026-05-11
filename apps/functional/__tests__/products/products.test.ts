import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {getProductsFromDb} from '@products/shell/db/getProducts';
import {getProductByIdFromDb} from '@products/shell/db/getProductById';
import {saveProduct} from '@products/shell/db/saveProduct';
import {categoryExistsInDb} from '@products/shell/db/categoryExists';
import type {TDbProduct} from '@products/core/types';
import jwt from 'jsonwebtoken';

jest.mock('@products/shell/db/getProducts');
jest.mock('@products/shell/db/getProductById');
jest.mock('@products/shell/db/saveProduct');
jest.mock('@products/shell/db/categoryExists');

const mockedGetProducts = getProductsFromDb as jest.Mock<ReturnType<typeof getProductsFromDb>, [unknown, unknown]>;
const mockedGetProductById = getProductByIdFromDb as jest.Mock<ReturnType<typeof getProductByIdFromDb>, [unknown, number]>;
const mockedSaveProduct = saveProduct as jest.Mock<ReturnType<typeof saveProduct>, [unknown, unknown]>;
const mockedCategoryExists = categoryExistsInDb as jest.Mock<ReturnType<typeof categoryExistsInDb>, [unknown, number]>;

const dbProduct: TDbProduct = {
  id: 1,
  name: 'Laptop',
  description: 'A great laptop',
  price: '999.99',
  stock: 10,
  categoryId: 1,
  createdAt: new Date(),
};

const token = jwt.sign({userId: '1', email: 'test@test.com'}, 'dev-secret', {expiresIn: '1h'});

describe('GET /api/products', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 200 with list of products', async () => {
    mockedGetProducts.mockReturnValue(TE.right([dbProduct]));

    const response = await request(app).get('/api/products');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Laptop');
  });

  test('returns 200 with empty list', async () => {
    mockedGetProducts.mockReturnValue(TE.right([]));

    const response = await request(app).get('/api/products');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  test('passes query params as filter', async () => {
    mockedGetProducts.mockReturnValue(TE.right([]));

    await request(app).get('/api/products?category_id=2&search=laptop&page=1&limit=5');
    expect(mockedGetProducts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({categoryId: 2, search: 'laptop', page: 1, limit: 5}),
    );
  });
});

describe('GET /api/products/:id', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 200 with product', async () => {
    mockedGetProductById.mockReturnValue(TE.right(dbProduct));

    const response = await request(app).get('/api/products/1');
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Laptop');
  });

  test('returns 404 when not found', async () => {
    mockedGetProductById.mockReturnValue(TE.right(null));

    const response = await request(app).get('/api/products/999');
    expect(response.status).toBe(404);
    expect(response.body.error.type).toBe('NotFound');
  });

  test('returns 400 on invalid id', async () => {
    const response = await request(app).get('/api/products/abc');
    expect(response.status).toBe(400);
    expect(response.body.error.type).toBe('ValidationError');
  });
});

describe('POST /api/products', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 401 without token', async () => {
    const response = await request(app).post('/api/products').send({name: 'Laptop', price: 999, stock: 10});
    expect(response.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error.type).toBe('ValidationError');
  });

  test('returns 422 when category not found', async () => {
    mockedCategoryExists.mockReturnValue(TE.right(false));

    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'Laptop', price: 999.99, stock: 10, categoryId: 99});
    expect(response.status).toBe(422);
    expect(response.body.error.type).toBe('UnprocessableEntity');
  });

  test('returns 201 on success without category', async () => {
    mockedSaveProduct.mockReturnValue(TE.right({...dbProduct, categoryId: null}));

    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'Laptop', price: 999.99, stock: 10});
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Laptop');
  });

  test('returns 201 on success with category', async () => {
    mockedCategoryExists.mockReturnValue(TE.right(true));
    mockedSaveProduct.mockReturnValue(TE.right(dbProduct));

    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'Laptop', price: 999.99, stock: 10, categoryId: 1});
    expect(response.status).toBe(201);
    expect(response.body.data.categoryId).toBe(1);
  });
});
