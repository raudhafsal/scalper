import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return jsonError('Validation failed', 422, { issues: err.issues });
  }
  if (err instanceof Error) {
    if (err.name === 'UnauthenticatedError') return jsonError('Unauthenticated', 401);
    if (err.name === 'PermissionError') return jsonError(err.message, 403);
    // eslint-disable-next-line no-console
    console.error(err);
    return jsonError('Internal server error', 500);
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return jsonError('Internal server error', 500);
}
