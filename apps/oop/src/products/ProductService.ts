import type {DbProduct, ProductFilter, ProductToSave} from './ProductTypes';
import type {ProductRepository} from './ProductRepository';

type CreateProductDto = {
  name: string;
  description?: string;
  price: number;
  stock: number;
  categoryId?: number;
};

export class ProductService {
  constructor(
    private productRepository: Pick<ProductRepository, 'findAll' | 'findById' | 'categoryExists' | 'save'>,
  ) {}

  async getAll(filter: ProductFilter): Promise<DbProduct[]> {
    return this.productRepository.findAll(filter);
  }

  async getById(id: number): Promise<DbProduct | null> {
    return this.productRepository.findById(id);
  }

  async create(dto: CreateProductDto): Promise<DbProduct> {
    if (dto.categoryId != null) {
      const exists = await this.productRepository.categoryExists(dto.categoryId);
      if (!exists) throw new Error('CategoryNotFound');
    }
    return this.productRepository.save(dto as ProductToSave);
  }
}
