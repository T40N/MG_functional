import request from 'supertest';
import app from '../src/index';

describe('Express Server Tests', () => {
  // Test the root endpoint
  test('GET / should return 200 and correct message', async () => {
    const response = await request(app).get('/');
    expect(response.statusCode).toBe(200);
    expect(response.text).toContain('Hello World! Express.js server is running.');
  });

  // Test a non-existent endpoint
  test('GET /nonexistent should return 404', async () => {
    const response = await request(app).get('/nonexistent');
    expect(response.statusCode).toBe(404);
  });
});