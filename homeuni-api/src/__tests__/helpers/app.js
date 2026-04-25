import express from 'express';
import { errorHandler } from '../../middleware/errors.js';
import { query } from '../../db/pool.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { injectionDetection } from '../../middleware/injectionDetection.js';
import { piiAudit } from '../../middleware/piiAudit.js';
import authRoutes from '../../routes/auth.js';
import progressRoutes from '../../routes/progress.js';
import flashcardRoutes from '../../routes/flashcards.js';
import { requireAuth } from '../../middleware/auth.js';

export function createTestApp() {
  const app = express();
  app.use(express.json());

  // Public certificate verification (mirrors index.js)
  app.get('/api/certificates/:code', async (req, res) => {
    try {
      const { rows: [cert] } = await query(
        'SELECT * FROM certificates WHERE verification_code = $1',
        [req.params.code]
      );
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });
      res.json({ certificate: cert, verified: true });
    } catch {
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  // Test route exercising AI security middleware (for rateLimit / injection tests)
  app.post('/api/test-ai', requireAuth, rateLimit, injectionDetection, piiAudit, (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/flashcards', flashcardRoutes);

  app.use(errorHandler);
  return app;
}
