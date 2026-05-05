import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/index';

jest.mock('jsonwebtoken');
const mockedJwtVerify = jwt.verify as jest.Mock;

describe('GET /api/me', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns 401 when no token', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.type).toBe('Unauthorized');
  });

  test('returns 401 when token is invalid', async () => {
    mockedJwtVerify.mockImplementation(() => { throw new Error('invalid'); });

    const res = await request(app).get('/api/me').set('Authorization', 'Bearer bad-token');

    expect(res.status).toBe(401);
    expect(res.body.error.type).toBe('Unauthorized');
  });

  test('returns 200 with userId when token is valid', async () => {
    mockedJwtVerify.mockReturnValue({ userId: '42', email: 'jan@example.com' });

    const res = await request(app).get('/api/me').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('42');
  });
});
