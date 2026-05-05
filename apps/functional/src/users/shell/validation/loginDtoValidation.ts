import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, {message: 'Password is required'}),
});

export const validateLoginRequest = validate(LoginDtoSchema);
