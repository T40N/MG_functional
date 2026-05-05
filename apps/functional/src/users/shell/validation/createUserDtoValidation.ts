import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

export const CreateUserDtoSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  surname: z.string().min(1, { message: 'Surname is required' }),
  email: z.string().email(),
  password: z.string()
    .min(8, { message: 'Password should have minimum length of 8' })
    .max(30, 'Password is too long, max length of 30 characters')
    .regex(/^(?=.*[A-Z]).{8,}$/, {
      message:
        'Should Contain at least one uppercase letter and have a minimum length of 8 characters.',
    }),
  confirm_password: z.string()
    .min(8, { message: 'Password should have minimum length of 8' })
    .max(30, 'Password is too long, max length of 30 characters')
    .regex(/^(?=.*[A-Z]).{8,}$/, {
      message:
        'Should Contain at least one uppercase letter and have a minimum length of 8 characters.',
    }),
}).superRefine(({ confirm_password, password }, ctx) => {
  if (confirm_password !== password) {
    ctx.addIssue({
      code: 'custom',
      message: 'The passwords did not match',
      path: ['confirmPassword'],
    });
  }
});

export const validateCreateUserRequest = validate(CreateUserDtoSchema);