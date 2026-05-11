import type {DbCategory} from './CategoryTypes';
import type {CategoryRepository} from './CategoryRepository';

type CreateCategoryDto = {name: string; description?: string};

export class CategoryService {
  constructor(
    private categoryRepository: Pick<CategoryRepository, 'findAll' | 'findByName' | 'save'>,
  ) {}

  async getAll(): Promise<DbCategory[]> {
    return this.categoryRepository.findAll();
  }

  async create(dto: CreateCategoryDto): Promise<DbCategory> {
    const existing = await this.categoryRepository.findByName(dto.name);
    if (existing) throw new Error('CategoryAlreadyExists');

    return this.categoryRepository.save({name: dto.name, description: dto.description});
  }
}
