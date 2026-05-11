import {Request, Response, Router} from 'express';
import {ApiResponse} from '@common/utils/ApiResponse';
import {authMiddleware} from '@common/middleware/authMiddleware';
import {createProductSchema} from './validators/productValidators';
import type {ProductService} from './ProductService';
import type {ProductFilter} from './ProductTypes';

export class ProductController {
  router = Router();

  constructor(private productService: ProductService) {
    this.router.get('/api/products', this.getAll);
    this.router.get('/api/products/:id', this.getById);
    this.router.post('/api/products', authMiddleware, this.create);
  }

  private getAll = async (req: Request, res: Response): Promise<void> => {
    const filter: ProductFilter = {
      categoryId: req.query.category_id ? parseInt(req.query.category_id as string, 10) : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    try {
      const products = await this.productService.getAll(filter);
      res.status(200).json(ApiResponse.success(products, 'Products fetched successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json(ApiResponse.error('InternalError', msg));
    }
  };

  private getById = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Invalid product id.'));
      return;
    }

    try {
      const product = await this.productService.getById(id);
      if (!product) {
        res.status(404).json(ApiResponse.error('NotFound', 'Product not found.'));
        return;
      }
      res.status(200).json(ApiResponse.success(product, 'Product fetched successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json(ApiResponse.error('InternalError', msg));
    }
  };

  private create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(ApiResponse.error('ValidationError', 'Request body is not valid.', parsed.error.errors));
      return;
    }

    try {
      const product = await this.productService.create(parsed.data);
      res.status(201).json(ApiResponse.success(product, 'Product created successfully'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'CategoryNotFound') {
        res.status(422).json(ApiResponse.error('UnprocessableEntity', 'Category not found.'));
      } else {
        res.status(500).json(ApiResponse.error('InternalError', msg));
      }
    }
  };
}
