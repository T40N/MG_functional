export type ApiErrorResponse = {
  success: false;
  error: {
    type: string;
    details?: unknown;
  };
  message: string;
}

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message: string;
}

export type ApiResponse<T> = ApiErrorResponse | ApiSuccessResponse<T>;

export const createResponse = <T>(
  type: 'success' | 'error',
  payload: T | { type: string; details?: unknown },
  message: string,
): ApiResponse<T> => {
  const handlers: Record<'success' | 'error', () => ApiResponse<T>> = {
    success: (): ApiSuccessResponse<T> => ({
      success: true,
      data: payload as T,
      message,
    }),
    error: (): ApiErrorResponse => ({
      success: false,
      error: payload as { type: string; details?: unknown },
      message,
    }),
  };

  return handlers[type]();
};