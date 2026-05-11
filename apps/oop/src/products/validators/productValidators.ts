import {z} from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, {message: 'Name is required'}).max(200, {message: 'Name is too long'}),
  description: z.string().max(2000, {message: 'Description is too long'}).optional(),
  price: z.number().positive({message: 'Price must be positive'}),
  stock: z.number().int().min(0, {message: 'Stock cannot be negative'}),
  categoryId: z.number().int().positive().optional(),
});
