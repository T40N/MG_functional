import {z} from 'zod';
import {CreateUserDtoSchema} from '../validation/createUserDtoValidation';

export type TCreateUserDto = z.infer<typeof CreateUserDtoSchema>;
