import 'server-only';

export type ApiSuccess<T> = { data: T };
export type ApiError = { error: string };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json({ data } satisfies ApiSuccess<T>, { status: 200, ...init });
}

export function jsonErr(message: string, status = 400, init: ResponseInit = {}): Response {
  return Response.json({ error: message } satisfies ApiError, { status, ...init });
}

export function jsonFromError(err: unknown, status = 500, init: ResponseInit = {}): Response {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
  return jsonErr(message, status, init);
}
