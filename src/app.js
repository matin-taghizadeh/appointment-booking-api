import express from 'express';
import { loadConfig } from './config.js';
import { createAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { servicesRouter } from './routes/services.js';
import { errorHandler } from './utils/errors.js';

export function createApp(overrides = {}) {
  const cfg = loadConfig(overrides);
  const auth = createAuth(cfg);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.use('/api/auth', authRouter(cfg, auth));
  app.use('/api/services', servicesRouter(cfg, auth));
  app.use('/api/bookings', bookingsRouter(cfg, auth));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  return app;
}
