import {z} from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1, {message: 'Name is required'}).max(100, {message: 'Name is too long'}),
  description: z.string().max(500, {message: 'Description is too long'}).optional(),
});
