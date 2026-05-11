import {ProductService} from '../../src/products/ProductService';
import type {DbProduct} from '../../src/products/ProductTypes';

const dbProduct: DbProduct = {
  id: 1,
  name: 'Laptop',
  description: 'A great laptop',
  price: '999.99',
  stock: 10,
  categoryId: 1,
  createdAt: new Date(),
};

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  categoryExists: jest.fn(),
  save: jest.fn(),
};

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ProductService(mockRepo as any);
  });

  describe('getAll', () => {
    test('returns list of products', async () => {
      mockRepo.findAll.mockResolvedValue([dbProduct]);
      const result = await service.getAll({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Laptop');
    });

    test('passes filter to repository', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      await service.getAll({categoryId: 1, search: 'laptop', page: 2, limit: 5});
      expect(mockRepo.findAll).toHaveBeenCalledWith({categoryId: 1, search: 'laptop', page: 2, limit: 5});
    });
  });

  describe('getById', () => {
    test('returns product when found', async () => {
      mockRepo.findById.mockResolvedValue(dbProduct);
      const result = await service.getById(1);
      expect(result?.name).toBe('Laptop');
    });

    test('returns null when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const result = await service.getById(999);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    test('throws CategoryNotFound when category does not exist', async () => {
      mockRepo.categoryExists.mockResolvedValue(false);
      await expect(
        service.create({name: 'Laptop', price: 999.99, stock: 10, categoryId: 99}),
      ).rejects.toThrow('CategoryNotFound');
    });

    test('returns saved product on success with category', async () => {
      mockRepo.categoryExists.mockResolvedValue(true);
      mockRepo.save.mockResolvedValue(dbProduct);
      const result = await service.create({name: 'Laptop', price: 999.99, stock: 10, categoryId: 1});
      expect(result.name).toBe('Laptop');
    });

    test('skips category check when no categoryId', async () => {
      mockRepo.save.mockResolvedValue({...dbProduct, categoryId: null});
      const result = await service.create({name: 'Laptop', price: 999.99, stock: 10});
      expect(result.categoryId).toBeNull();
      expect(mockRepo.categoryExists).not.toHaveBeenCalled();
    });
  });
});
