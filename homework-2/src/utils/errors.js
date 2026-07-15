/**
 * Application error carrying an HTTP status code and optional structured details.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 422, details);
    this.name = 'ValidationError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, details);
    this.name = 'BadRequestError';
  }
}
