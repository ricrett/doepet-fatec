import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiApp } from './src/server/app.ts';
import { emitStructuredLog } from './src/server/observability.ts';

const PORT = Number(process.env.PORT || '3000');
const distDir = path.resolve(process.cwd(), 'dist');
const isStartLifecycle = process.env.npm_lifecycle_event === 'start';
const isProd =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && isStartLifecycle && fs.existsSync(distDir));

function mountStaticProduction(app: express.Express) {
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    emitStructuredLog('WARN', 'server.dist_missing', { distDir });
  }
}

async function startServer() {
  const app = createApiApp();
  let modeLabel: 'production' | 'development' = isProd ? 'production' : 'development';

  if (!isProd) {
    try {
      // Dynamic import avoids requiring Vite in production runtime
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      emitStructuredLog('WARN', 'server.vite_unavailable_fallback_dist', {
        error: err instanceof Error ? err.message : String(err),
      });
      modeLabel = 'production';
      mountStaticProduction(app);
    }
  } else {
    mountStaticProduction(app);
  }

  app.listen(PORT, '0.0.0.0', () => {
    emitStructuredLog('INFO', 'server.started', {
      port: PORT,
      mode: modeLabel,
    });
  });
}

startServer().catch((err) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: 'doepet-api',
      event: 'server.fatal_startup_error',
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
