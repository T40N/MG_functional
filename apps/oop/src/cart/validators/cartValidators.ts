import {z} from 'zod';

export const addToCartSchema = z.object({
  productId: z.number().int().positive({message: 'productId must be a positive integer'}),
  quantity: z.number().int().positive({message: 'quantity must be a positive integer'}),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive({message: 'quantity must be a positive integer'}),
});
