type SuccessResponse<T> = { success: true; data: T; message: string };
type ErrorResponse = { success: false; error: { type: string; details?: unknown }; message: string };

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export const ApiResponse = {
  success: <T>(data: T, message: string): SuccessResponse<T> => ({ success: true, data, message }),
  error: (type: string, message: string, details?: unknown): ErrorResponse => ({
    success: false,
    error: { type, details },
    message,
  }),
};
