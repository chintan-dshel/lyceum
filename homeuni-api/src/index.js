import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { errorHandler } from './middleware/errors.js';
import { query } from './db/pool.js';
import { rateLimit } from './middleware/rateLimit.js';
import { injectionDetection } from './middleware/injectionDetection.js';
import { piiAudit } from './middleware/piiAudit.js';

// Routes
import authRoutes from './routes/auth.js';
import programRoutes from './routes/programs.js';
import curriculumRoutes from './routes/curriculum.js';
import lessonRoutes from './routes/lessons.js';
import assignmentRoutes from './routes/assignments.js';
import examRoutes from './routes/exams.js';
import progressRoutes from './routes/progress.js';
import lectureRoutes from './routes/lectures.js';
import studyRoutes from './routes/study.js';
import telemetryRoutes from './routes/telemetry.js';
import flashcardRoutes from './routes/flashcards.js';
import { startWorkers } from './jobs/queue.js';

const app = express();
const server = createServer(app);

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Lyceum API' }));

// Public certificate verification (no auth)
app.get('/api/certificates/:code', async (req, res) => {
  try {
    const { rows: [cert] } = await query(
      'SELECT * FROM certificates WHERE verification_code = $1',
      [req.params.code]
    );
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ certificate: cert, verified: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/progress', progressRoutes);
// Security stack for AI-facing routes (user content reaches LLM)
// Order: rateLimit → injectionDetection → piiAudit → route handler
const aiSecurity = [rateLimit, injectionDetection, piiAudit];

app.use('/api/lectures', ...aiSecurity, lectureRoutes);
app.use('/api/study', ...aiSecurity, studyRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/flashcards', flashcardRoutes);

// ── Static UI ─────────────────────────────────────────────────────────────────
// ALL /api/* route registrations must appear ABOVE this line.
// The catch-all below will intercept any unmatched GET and serve index.html for
// client-side routing. Adding /api/* routes below this line will silently break
// them in production — the browser will receive HTML instead of JSON.
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));
}
// ─────────────────────────────────────────────────────────────────────────────

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🏛  Lyceum API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
  startWorkers();
});

export default app;
