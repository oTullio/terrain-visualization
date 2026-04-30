import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cesium static assets that must be copied to the build output.
// Pattern follows the official CesiumGS/cesium-vite-example.
const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

// ---------------------------------------------------------------------------
// Dev-only middleware that exposes /api/<name> handlers (Vercel serverless
// functions at apps/api/api/<name>.ts) inside the Vite dev server.
// We adapt Connect's IncomingMessage / ServerResponse into the VercelRequest /
// VercelResponse shape the handlers expect, then delegate via ssrLoadModule.
// In production the real Vercel functions are used; this plugin is dev-only.
//
// Adding a new layer (e.g. /api/roads in Phase C3) requires NO changes here:
// the middleware dynamically routes any /api/<name> GET to ../api/api/<name>.ts.
// ---------------------------------------------------------------------------

const API_HANDLERS_DIR = path.resolve(__dirname, '../api/api');

interface VercelLikeReq {
  method: string | undefined;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  url: string | undefined;
  body?: unknown;
}

function buildApiDevPlugin(): Plugin {
  return {
    name: 'terrain-api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req, res, next) => {
        if (req.method !== 'GET') return next();

        // Extract the handler name from the URL path: /api/water?... → 'water'
        const rawUrl = req.url ?? '';
        const pathSegment = rawUrl.split('?')[0]!.replace(/^\//, ''); // e.g. 'water'
        if (!pathSegment || /[^a-zA-Z0-9_-]/.test(pathSegment)) return next();

        const handlerPath = path.join(API_HANDLERS_DIR, `${pathSegment}.ts`);

        try {
          const mod = (await server.ssrLoadModule(handlerPath)) as {
            default?: (req: unknown, res: unknown) => Promise<void> | void;
          };

          if (typeof mod.default !== 'function') return next();

          // Build a VercelRequest-shaped object from the Connect req.
          const url = req.url ?? '';
          const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
          const params = new URLSearchParams(search);
          const query: Record<string, string | string[]> = {};
          for (const key of params.keys()) {
            const all = params.getAll(key);
            const first = all[0];
            if (all.length === 1 && first !== undefined) {
              query[key] = first;
            } else {
              query[key] = all;
            }
          }
          const vReq: VercelLikeReq = {
            method: req.method,
            query,
            headers: req.headers,
            url,
          };

          // VercelResponse adapter — chainable status()/setHeader()/json()/end().
          const vRes = {
            statusCode: 200,
            status(code: number) {
              vRes.statusCode = code;
              res.statusCode = code;
              return vRes;
            },
            setHeader(name: string, value: string | number | readonly string[]) {
              res.setHeader(name, value as string);
              return vRes;
            },
            getHeader(name: string) {
              return res.getHeader(name);
            },
            json(body: unknown) {
              if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json');
              }
              res.statusCode = vRes.statusCode;
              res.end(JSON.stringify(body));
              return vRes;
            },
            send(body: string | Buffer) {
              res.statusCode = vRes.statusCode;
              res.end(body);
              return vRes;
            },
            end(body?: string | Buffer) {
              res.statusCode = vRes.statusCode;
              if (body !== undefined) res.end(body);
              else res.end();
              return vRes;
            },
          };

          await mod.default(vReq, vRes);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[dev /api/${pathSegment}] handler crashed:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Dev API middleware crashed.',
              }),
            );
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    buildApiDevPlugin(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  define: {
    // Required so Cesium can locate its static assets at runtime.
    // We also set window.CESIUM_BASE_URL in the entry point for belt-and-suspenders.
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  resolve: {
    alias: {
      '@terrain/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    // Cesium's bundle is large — raise the warning threshold.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Split Cesium into its own chunk to keep the main bundle small.
        manualChunks: {
          cesium: ['cesium'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  css: {
    postcss: './postcss.config.js',
  },
});
