import request from 'supertest';
import * as TE from 'fp-ts/TaskEither';
import app from '../../src/index';
import {getAllCategories} from '@categories/shell/db/getAllCategories';
import {getCategoryByName} from '@categories/shell/db/getCategoryByName';
import {saveCategory} from '@categories/shell/db/saveCategory';
import type {TDbCategory} from '@categories/core/types';
import jwt from 'jsonwebtoken';

jest.mock('@categories/shell/db/getAllCategories');
jest.mock('@categories/shell/db/getCategoryByName');
jest.mock('@categories/shell/db/saveCategory');

const mockedGetAllCategories = getAllCategories as jest.Mock<ReturnType<typeof getAllCategories>, [unknown]>;
const mockedGetCategoryByName = getCategoryByName as jest.Mock<ReturnType<typeof getCategoryByName>, [unknown, string]>;
const mockedSaveCategory = saveCategory as jest.Mock<ReturnType<typeof saveCategory>, [unknown, unknown]>;

const dbCategory: TDbCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic devices',
  createdAt: new Date(),
};

const token = jwt.sign({userId: '1', email: 'test@test.com'}, 'dev-secret', {expiresIn: '1h'});

describe('GET /api/categories', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 200 with list of categories', async () => {
    mockedGetAllCategories.mockReturnValue(TE.right([dbCategory]));

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Electronics');
  });

  test('returns 200 with empty list', async () => {
    mockedGetAllCategories.mockReturnValue(TE.right([]));

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe('POST /api/categories', () => {
  beforeEach(() => {
    (app as any).dbPool = {};
    jest.resetAllMocks();
  });

  test('returns 401 without token', async () => {
    const response = await request(app).post('/api/categories').send({name: 'Electronics'});
    expect(response.status).toBe(401);
  });

  test('returns 400 on validation error', async () => {
    const response = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.type).toBe('ValidationError');
  });

  test('returns 409 when category already exists', async () => {
    mockedGetCategoryByName.mockReturnValue(TE.right(dbCategory));

    const response = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'Electronics'});

    expect(response.status).toBe(409);
    expect(response.body.error.type).toBe('Conflict');
  });

  test('returns 201 on success', async () => {
    mockedGetCategoryByName.mockReturnValue(TE.right(null));
    mockedSaveCategory.mockReturnValue(TE.right(dbCategory));

    const response = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'Electronics', description: 'Electronic devices'});

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Electronics');
  });
});
