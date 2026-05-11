import {CategoryService} from '../../src/categories/CategoryService';
import type {DbCategory} from '../../src/categories/CategoryTypes';

const dbCategory: DbCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic devices',
  createdAt: new Date(),
};

const mockCategoryRepository = {
  findAll: jest.fn(),
  findByName: jest.fn(),
  save: jest.fn(),
};

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CategoryService(mockCategoryRepository as any);
  });

  describe('getAll', () => {
    test('returns list of categories', async () => {
      mockCategoryRepository.findAll.mockResolvedValue([dbCategory]);

      const result = await service.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Electronics');
    });

    test('returns empty list when no categories', async () => {
      mockCategoryRepository.findAll.mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('create', () => {
    test('throws CategoryAlreadyExists when name taken', async () => {
      mockCategoryRepository.findByName.mockResolvedValue(dbCategory);

      await expect(
        service.create({name: 'Electronics'}),
      ).rejects.toThrow('CategoryAlreadyExists');
    });

    test('returns saved category on success', async () => {
      mockCategoryRepository.findByName.mockResolvedValue(null);
      mockCategoryRepository.save.mockResolvedValue(dbCategory);

      const result = await service.create({name: 'Electronics', description: 'Electronic devices'});

      expect(result.name).toBe('Electronics');
      expect(result.id).toBe(1);
    });
  });
});
