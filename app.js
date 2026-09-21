import express from 'express';
import cors from 'cors';
import { requestLogger, logParserError } from './middleware/request-logger.js';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from './modules/branches/index.js';

// Importing this factory opens no port and creates no connection, timer, or job.
export function createApp({ db, geocoding, logger = console, staging = false, dataMode = 'synthetic' }) {
  const app = express();
  app.set('trust proxy', process.env.ATTICA_TRUST_PROXY || 'loopback, linklocal, uniquelocal');
  if (staging) app.use(requestLogger(logger));
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use('/api', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
      Pragma: 'no-cache', Expires: '0', 'Surrogate-Control': 'no-store',
    });
    next();
  });
  if (staging) {
    app.use((_req, res, next) => { res.set('X-Attica-Staging', dataMode === 'synthetic' ? 'synthetic-data-only' : 'staging-database-read-only'); next(); });
    app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'staging', data: dataMode, features: ['branches'], jobs: false, telephony: false }));
    app.use('/api', (req, res, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return res.status(405).json({ error: 'Staging preview is read-only' });
      next();
    });
  }
  const controller = createBranchesModule({ db, geocoding, logger });
  mountBranchesCatalog(app, controller);
  mountBranchesAutocomplete(app, controller);
  if (staging) app.use(logParserError);
  return app;
}
