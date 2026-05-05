import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../src/common/middleware/authMiddleware';

jest.mock('jsonwebtoken');
const mockedJwtVerify = jwt.verify as jest.Mock;

const mockRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (authHeader?: string) =>
  ({ headers: { authorization: authHeader }, userId: undefined } as unknown as Request);

const mockNext: NextFunction = jest.fn();

describe('authMiddleware', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns 401 when Authorization header is missing', () => {
    authMiddleware(mockReq(), mockRes(), mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when Authorization header is not Bearer', () => {
    authMiddleware(mockReq('Basic abc123'), mockRes(), mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 401 when token is invalid', () => {
    mockedJwtVerify.mockImplementation(() => { throw new Error('invalid token'); });

    authMiddleware(mockReq('Bearer bad-token'), mockRes(), mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  test('calls next and sets req.userId when token is valid', () => {
    mockedJwtVerify.mockReturnValue({ userId: '42', email: 'jan@example.com' });
    const req = mockReq('Bearer valid-token');
    const res = mockRes();

    authMiddleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.userId).toBe('42');
    expect(res.status).not.toHaveBeenCalled();
  });
});
