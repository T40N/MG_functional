import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

export const AddToCartDtoSchema = z.object({
  productId: z.number().int().positive({message: 'productId must be a positive integer'}),
  quantity: z.number().int().positive({message: 'quantity must be a positive integer'}),
});

export const UpdateCartItemDtoSchema = z.object({
  quantity: z.number().int().positive({message: 'quantity must be a positive integer'}),
});

export const validateAddToCartRequest = validate(AddToCartDtoSchema);
export const validateUpdateCartItemRequest = validate(UpdateCartItemDtoSchema);
