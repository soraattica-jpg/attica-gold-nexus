import { randomUUID } from 'node:crypto';

// No payloads, query values, message text, credentials or SQL in logs.
export function requestLogger(logger = console) {
  return (req, res, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    res.set('X-Request-ID', requestId);
    const context = () => ({ requestId, method: req.method, route: req.route?.path || '(unmatched)', port: req.socket.localPort });
    res.locals.reportError = (error) => logger.error(JSON.stringify({
      event: 'request_error', ...context(), name: error?.name || 'Error', code: error?.code || 'REQUEST_FAILED',
    }));
    res.once('finish', () => {
      const entry = { event: 'request', ...context(), status: res.statusCode, durationMs: Math.round(performance.now() - started) };
      const write = res.statusCode >= 400 ? logger.error.bind(logger) : logger.info.bind(logger);
      write(JSON.stringify(entry));
    });
    next();
  };
}

export function logParserError(error, req, res, next) {
  res.locals.reportError?.(error);
  next(error);
}
