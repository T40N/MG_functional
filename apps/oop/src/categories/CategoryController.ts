import {Request, Response, Router} from 'express';
import {ApiResponse} from '@common/utils/ApiResponse';
import {authMiddleware} from '@common/middleware/authMiddleware';
import {createCategorySchema} from './validators/categoryValidators';
import type {CategoryService} from './CategoryService';

export class CategoryController {
  router = Router();

  constructor(private categoryService: CategoryService) {
    this.router.get('/api/categories', this.getAll);
    this.router.post('/api/categories', authMiddleware, this.create);
  }

  private getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const categories = await this.categoryService.getAll();
      res.status(200).json(ApiResponse.success(categories, 'Categories fetched successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json(ApiResponse.error('InternalError', msg));
    }
  };

  private create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Request body is not valid.', parsed.error.errors));
      return;
    }

    try {
      const category = await this.categoryService.create(parsed.data);
      res.status(201).json(ApiResponse.success(category, 'Category created successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'CategoryAlreadyExists') {
        res.status(409).json(ApiResponse.error('Conflict', 'Category with this name already exists'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };
}
