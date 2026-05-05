import type {TCreateUserDto} from '../dtos/TCreateUserDto';
import type {TCreateUserInput} from '@users/core/types';

export const fromCreateUserRequestToUserInput = (requestUser: TCreateUserDto): TCreateUserInput => {
  return {
    email: requestUser.email,
    password: requestUser.password,
    name: requestUser.name,
    surname: requestUser.surname,
  };
};