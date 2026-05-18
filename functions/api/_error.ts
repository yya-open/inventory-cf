import { errorResponse } from '../_auth';

export function throwHttpError(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

export function withErrorHandling<E = any>(handler: PagesFunction<E>): PagesFunction<E> {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error: any) {
      return errorResponse(error);
    }
  };
}
