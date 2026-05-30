import express from 'express';
import cluster from 'node:cluster';
import os from 'node:os';
import { handler as ssrHandler } from './dist/server/entry.mjs';

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`[Master] Principal process ${process.pid} starting...`);
  console.log(`[Master] ${numCPUs} processor cores. Starting workers...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Master] The worker ${worker.process.pid} has died (Signal: ${signal}). Restarting...`);
    cluster.fork();
  });
} else {
  const app = express();
  
  app.disable('x-powered-by');

  // Global middleware to set security headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://www.googleapis.com wss: stun: turn:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    res.setHeader('Content-Security-Policy', csp);

    next();
  });

  app.use(express.static('dist/client/'));
  app.use(ssrHandler);

  app.listen(PORT, HOST, () => {
    console.log(`[Worker] Ready in http://${HOST}:${PORT} (PID: ${process.pid})`);
  });
}
