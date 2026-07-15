import multer from 'multer';
import { AppError } from '../utils/errors.js';

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} does not exist`,
  });
}

/**
 * Centralized error-handling middleware. Maps known error types to status
 * codes and always returns a consistent JSON error body.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'UploadError',
      message: err.message,
    });
  }

  // Unexpected error — log and return a generic 500.
  console.error('[unexpected-error]', err);
  return res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
