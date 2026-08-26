import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),   // identyczne z apps/oop/src/users/validators/userValidators.ts
});

export const validateLoginRequest = validate(LoginDtoSchema);
