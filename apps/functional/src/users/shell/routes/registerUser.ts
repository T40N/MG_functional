import {Express, Request, Response} from 'express';
import { pipe } from 'fp-ts/function';
import { createUser } from '@users/core/usecases/createUser';
import * as E from 'fp-ts/Either';
import bcrypt from 'bcrypt';
import {validateCreateUserRequest} from '@users/shell/validation/createUserDtoValidation';
import {createResponse} from '@common/core/usecases/createResponse';
import {saveUser} from '@users/shell/db/saveUser';
import {fromCreateUserRequestToUserInput} from '@users/shell/factories/userFactory';
import {TUserToSave} from '@users/core/types';
import {getUserByEmail} from '@users/shell/db/getUserByEmail';
import jwt from 'jsonwebtoken';
import * as TE from 'fp-ts/TaskEither';

export const registerUserHandler = async (req: Request, res: Response): Promise<Response> => {
  const validationResult = validateCreateUserRequest(req.body);

  if (E.isLeft(validationResult)) {
    return res.status(403).send(createResponse('error', {
      type: 'Validation error',
      details: validationResult.left.errors,
    }, 'Request body is not valid registration.'));
  }

  const userInput = fromCreateUserRequestToUserInput(validationResult.right);

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).send(createResponse('error', {
      type: 'Database connection error',
    }, 'Could not connect to the database.'));
  }

  const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  const env = {
    getUserByEmail: (email: string) => getUserByEmail(pool, email),
    hashPassword: (password: string) =>
      TE.tryCatch(
        () => bcrypt.hash(password, 10),
        (reason) => new Error(`Password hash failed: ${reason}`),
      ),
    saveUser: (userToSave: TUserToSave) => saveUser(pool, userToSave),
    createToken: (payload: {userId: string; email: string}) =>
      TE.tryCatch(
        () => Promise.resolve(jwt.sign(payload, jwtSecret, {expiresIn: '1h'})),
        (reason) => new Error(`Token creation failed: ${reason}`),
      ),
  };

  const result = await createUser(userInput)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        const isConflict = error.message === 'UserAlreadyExists';
        const status = isConflict ? 409 : 500;
        const message = isConflict
          ? 'User with this email already exists'
          : error.message;
        const errorType = isConflict ? 'Conflict' : 'InternalError';
        return res.status(status).json(
          createResponse(
            'error',
            {type: errorType, details: null},
            message,
          ),
        );
      },
      (payload) =>
        res.status(201).json(
          createResponse('success', payload, 'User created successfully'),
        ),
    ),
  );
};


/**
 * Register user routes on the Express app
 * @param app - Express application
 */
export const registerUserRoutes = (app: Express): void => {
  app.post('/api/users/register', registerUserHandler);
};