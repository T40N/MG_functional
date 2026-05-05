import { z } from 'zod';

export const createUserSchema = z.object({
  name:             z.string().min(1),
  surname:          z.string().min(1),
  email:            z.string().email(),
  password:         z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain digit'),
  confirm_password: z.string(),
}).refine(d => d.password === d.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] });

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
