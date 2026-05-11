import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

export const CreateCategoryDtoSchema = z.object({
  name: z.string().min(1, {message: 'Name is required'}).max(100, {message: 'Name is too long'}),
  description: z.string().max(500, {message: 'Description is too long'}).optional(),
});

export const validateCreateCategoryRequest = validate(CreateCategoryDtoSchema);
