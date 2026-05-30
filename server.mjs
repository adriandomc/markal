import express from 'express';
import { handler as ssrHandler } from './dist/server/entry.mjs';

const app = express();
app.disable('x-powered-by');

// Global Security Headers Middleware
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

// Serve static assets from the Astro build output
// Using express.static will automatically serve any file in dist/client, and they will get the headers above!
app.use(express.static('dist/client/'));

// Let Astro handle the SSR routes
app.use(ssrHandler);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
