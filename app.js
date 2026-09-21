import express from 'express';
import cors from 'cors';
import { mountAdminMessages, mountIndividualMessage } from './modules/admin-messages/index.js';
import { mountCustomerHistory } from './modules/customer-history/index.js';
import { mountReports } from './modules/reports/index.js';
import { mountBilling } from './modules/billing/index.js';
import { mountSms } from './modules/sms/index.js';
import { requestLogger, logParserError } from './middleware/request-logger.js';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from './modules/branches/index.js';

// Importing this factory opens no port and creates no connection, timer, or job.
export function createApp({ db, geocoding, logger = console, staging = false, dataMode = 'synthetic', adminMessages = null, customerHistory = null, reports = null, billing = null, sms = null }) {
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
    app.use((_req, res, next) => { res.set('X-Attica-Staging', dataMode === 'synthetic' ? 'synthetic-data-only' : adminMessages ? 'staging-isolated-test-delivery' : 'staging-database-read-only'); next(); });
    app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'staging', data: dataMode, features: ['branches', ...(adminMessages ? ['admin-messages'] : []), ...(customerHistory ? ['customer-history'] : []), ...(reports ? ['reports-core'] : []), ...(billing ? ['billing-lookup'] : []), ...(sms ? ['sms-kaleyra-fake'] : [])], messageDelivery: adminMessages ? 'test-only' : null, smsDelivery: sms ? 'fake-only' : null, externalBillingSync: false, jobs: false, telephony: false }));
    if (adminMessages) {
      mountAdminMessages(app, adminMessages.controller, adminMessages.authorize);
      mountIndividualMessage(app, adminMessages.controller, adminMessages.authorize);
      app.get('/__test/admin-message-events', adminMessages.authorize('admin'), (_req, res) => res.json({ mode: 'test-only', events: adminMessages.events.list() }));
    }
    if (customerHistory) mountCustomerHistory(app, customerHistory.controller, customerHistory.authorize);
    if (reports) mountReports(app,reports.controller,reports.authorize);
    if (billing) mountBilling(app,billing.controller,billing.authorize);
    if (sms) {
      mountSms(app,sms.controller,sms.authorize);
      app.get('/__test/sms-deliveries', sms.authorize('read'), (_req,res)=>res.json({mode:'fake-only',deliveries:sms.deliveries}));
    }
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
