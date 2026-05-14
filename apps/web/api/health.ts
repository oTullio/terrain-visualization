import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/health
 * Simple health-check endpoint — confirms Vercel routing is wired up.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  });
}
