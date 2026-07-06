import express from 'express';
import ticketRoutes from './routes/ticketRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Build and configure the Express application.
 * Exported as a factory so tests can import a fresh app instance.
 */
export function createApp() {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/tickets', ticketRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
