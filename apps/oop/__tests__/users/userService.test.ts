import { UserService } from '../../src/users/UserService';
import type { DbUser } from '../../src/users/UserTypes';

const dbUser: DbUser = {
  id: '1',
  name: 'Jane',
  surname: 'Doe',
  email: 'jane@example.com',
  password: 'hashed',
  createdAt: new Date(),
};

const mockUserRepository = {
  findByEmail: jest.fn(),
  save: jest.fn(),
};

const mockPasswordService = {
  hash: jest.fn(),
  compare: jest.fn(),
};

const mockTokenService = {
  sign: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UserService(mockUserRepository as any, mockPasswordService, mockTokenService);
  });

  describe('register', () => {
    test('throws ConflictError when user already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(dbUser);

      await expect(
        service.register({ name: 'Jane', surname: 'Doe', email: 'jane@example.com', password: 'Password1' }),
      ).rejects.toThrow('UserAlreadyExists');
    });

    test('returns user and token on success', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockPasswordService.hash.mockResolvedValue('hashed');
      mockUserRepository.save.mockResolvedValue(dbUser);
      mockTokenService.sign.mockReturnValue('mock-token');

      const result = await service.register({
        name: 'Jane', surname: 'Doe', email: 'jane@example.com', password: 'Password1',
      });

      expect(result.token).toBe('mock-token');
      expect(result.user.email).toBe('jane@example.com');
      expect((result.user as any).password).toBeUndefined();
    });
  });

  describe('login', () => {
    test('throws UnauthorizedError when user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@example.com', password: 'Password1' }),
      ).rejects.toThrow('InvalidCredentials');
    });

    test('throws UnauthorizedError when password does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(dbUser);
      mockPasswordService.compare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toThrow('InvalidCredentials');
    });

    test('returns user and token on success', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(dbUser);
      mockPasswordService.compare.mockResolvedValue(true);
      mockTokenService.sign.mockReturnValue('mock-token');

      const result = await service.login({ email: 'jane@example.com', password: 'Password1' });

      expect(result.token).toBe('mock-token');
      expect(result.user.email).toBe('jane@example.com');
      expect((result.user as any).password).toBeUndefined();
    });
  });
});
