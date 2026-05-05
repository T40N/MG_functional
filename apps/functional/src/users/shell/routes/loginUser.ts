import {Express, Request, Response} from 'express';
import {pipe} from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {createResponse} from '@common/core/usecases/createResponse';
import {loginUser} from '@users/core/usecases/loginUser';
import {validateLoginRequest} from '@users/shell/validation/loginDtoValidation';
import {getUserByEmail} from '@users/shell/db/getUserByEmail';

export const loginUserHandler = async (req: Request, res: Response): Promise<Response> => {
  const validationResult = validateLoginRequest(req.body);

  if (E.isLeft(validationResult)) {
    return res.status(400).send(
      createResponse(
        'error',
        {type: 'Validation error', details: validationResult.left.errors},
        'Request body is not valid login.',
      ),
    );
  }

  const pool = res.app.dbPool;
  if (!pool) {
    return res.status(500).send(
      createResponse(
        'error',
        {type: 'Database connection error'},
        'Could not connect to the database.',
      ),
    );
  }

  const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  const env = {
    getUserByEmail: (email: string) => getUserByEmail(pool, email),
    comparePassword: (plain: string, hash: string) =>
      TE.tryCatch(
        () => bcrypt.compare(plain, hash),
        (reason) => new Error(`Password compare failed: ${reason}`),
      ),
    createToken: (payload: {userId: string; email: string}) =>
      TE.tryCatch(
        () => Promise.resolve(jwt.sign(payload, jwtSecret, {expiresIn: '1h'})),
        (reason) => new Error(`Token creation failed: ${reason}`),
      ),
  };

  const result = await loginUser(validationResult.right)(env)();

  return pipe(
    result,
    E.fold(
      (error) => {
        const isInvalid = error.message === 'InvalidCredentials';
        const status = isInvalid ? 401 : 500;
        const message = isInvalid ? 'Invalid email or password' : error.message;
        const errorType = isInvalid ? 'Unauthorized' : 'InternalError';
        return res.status(status).json(
          createResponse(
            'error',
            {type: errorType, details: null},
            message,
          ),
        );
      },
      (payload) =>
        res.status(200).json(
          createResponse('success', payload, 'Login successful'),
        ),
    ),
  );
};

/**
 * Register login routes on the Express app
 * @param app - Express application
 */
export const registerLoginRoutes = (app: Express): void => {
  app.post('/api/auth/login', loginUserHandler);
};
