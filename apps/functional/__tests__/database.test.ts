import { Pool, PoolClient } from 'pg';
import * as E from 'fp-ts/Either';

import {
  getDbConfig,
  createDbPool,
  connectToDb,
  executeQuery,
  releaseClient,
  executeQueryWithPool,
  initializeDb,
  DbConfig,
} from '../src/common/shell/database';

// Mock pg module
jest.mock('pg', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [{ test: 'data' }] });
  const mockRelease = jest.fn();
  const mockConnect = jest.fn().mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });
  
  return {
    Pool: jest.fn(() => ({
      connect: mockConnect,
    })),
  };
});

describe('Database Module Tests', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDbConfig', () => {
    test('should return default config when no env vars are provided', () => {
      const result = getDbConfig({});
      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toEqual({
          host: 'localhost',
          port: 5432,
          database: 'postgres',
          user: 'postgres',
          password: 'postgres',
        });
      }
    });

    test('should use environment variables when provided', () => {
      const env = {
        DB_HOST: 'testhost',
        DB_PORT: '1234',
        DB_NAME: 'testdb',
        DB_USER: 'testuser',
        DB_PASSWORD: 'testpass',
      };
      const result = getDbConfig(env);
      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toEqual({
          host: 'testhost',
          port: 1234,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        });
      }
    });

    test('should return an error for invalid port', () => {
      const env = { DB_PORT: 'invalid' };
      const result = getDbConfig(env);
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left.message).toContain('Invalid database port');
      }
    });
  });

  describe('createDbPool', () => {
    test('should create a new Pool instance with the provided config', () => {
      const config: DbConfig = {
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
      };
      const pool = createDbPool(config);
      expect(Pool).toHaveBeenCalledWith(config);
      expect(pool).toBeDefined();
    });
  });

  describe('connectToDb', () => {
    test('should connect to the database successfully', async () => {
      const mockPool = new Pool();
      const result = await connectToDb(mockPool)();
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(E.isRight(result)).toBe(true);
    });

    test('should handle connection errors', async () => {
      const mockPool = new Pool();
      const mockError = new Error('Connection error');
      (mockPool.connect as jest.Mock).mockRejectedValueOnce(mockError);
      
      const result = await connectToDb(mockPool)();
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left.message).toContain('Failed to connect to database');
      }
    });
  });

  describe('executeQuery', () => {
    test('should execute a query successfully', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ test: 'data' }] }),
        release: jest.fn(),
      } as unknown as PoolClient;
      
      const result = await executeQuery(mockClient, 'SELECT * FROM test')();
      
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(E.isRight(result)).toBe(true);
      if (E.isRight(result)) {
        expect(result.right).toEqual([{ test: 'data' }]);
      }
    });

    test('should handle query execution errors', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Query error')),
        release: jest.fn(),
      } as unknown as PoolClient;
      
      const result = await executeQuery(mockClient, 'SELECT * FROM test')();
      
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left.message).toContain('Query execution failed');
      }
    });
  });

  describe('releaseClient', () => {
    test('should release the client back to the pool', async () => {
      const mockClient = {
        release: jest.fn(),
      } as unknown as PoolClient;
      
      const result = await releaseClient(mockClient)();
      
      expect(mockClient.release).toHaveBeenCalled();
      expect(E.isRight(result)).toBe(true);
    });

    test('should handle release errors', async () => {
      const mockClient = {
        release: jest.fn().mockImplementation(() => {
          throw new Error('Release error');
        }),
      } as unknown as PoolClient;
      
      const result = await releaseClient(mockClient)();
      
      expect(mockClient.release).toHaveBeenCalled();
      expect(E.isLeft(result)).toBe(true);
      if (E.isLeft(result)) {
        expect(result.left.message).toContain('Failed to release client');
      }
    });
  });

  describe('executeQueryWithPool', () => {
    test('should connect, execute query, and release client', async () => {
      const mockPool = new Pool();
      const mockClient = await mockPool.connect();
      
      const result = await executeQueryWithPool(mockPool, 'SELECT * FROM test')();
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(mockClient.release).toHaveBeenCalled();
      expect(E.isRight(result)).toBe(true);
    });
  });

  describe('initializeDb', () => {
    test('should initialize database connection successfully', async () => {
      const env = {
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'postgres',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
      };
      
      // Mock console.log to avoid cluttering test output
      const originalConsoleLog = console.log;
      console.log = jest.fn();
      
      const result = await initializeDb(env)();
      
      // Restore console.log
      console.log = originalConsoleLog;
      
      expect(Pool).toHaveBeenCalled();
      expect(E.isRight(result)).toBe(true);
    });
  });
});