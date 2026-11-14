/** An error with an HTTP status. Messages are written for the person using the app. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const forbidden = (what = "You don't have access to this") => new HttpError(403, what);
export const conflict = (what: string, details?: Record<string, unknown>) => new HttpError(409, what, details);
export const unprocessable = (what: string, details?: Record<string, unknown>) => new HttpError(422, what, details);
export const unauthorized = (what = "Sign in first") => new HttpError(401, what);
