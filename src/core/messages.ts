import { pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';

// Pure function to generate welcome message
export const getWelcomeMessage = (): string => 
  'Hello World! Express.js server is running.';

// Pure function to format a message with optional prefix
export const formatMessage = (message: string) => (prefix: O.Option<string>): string =>
  pipe(
    prefix,
    O.fold(
      () => message,
      (p) => `${p}: ${message}`,
    ),
  );