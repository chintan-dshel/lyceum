/**
 * One-time database setup script.
 * Run with: node setup.js
 * Creates the lyceum user, database, and runs all migrations.
 */
import 'dotenv/config';
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function main() {
  console.log('\n  Lyceum — Database Setup\n');

  const password = await prompt('  Enter your PostgreSQL superuser (postgres) password: ');
  console.log('');

  // ── Connect as superuser ─────────────────────────────────────────────────
  const superClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
  });

  try {
    await superClient.connect();
    console.log('  ✓ Connected to PostgreSQL');
  } catch (err) {
    console.error('\n  ✗ Could not connect:', err.message);
    console.error('  Make sure PostgreSQL is running and the password is correct.\n');
    process.exit(1);
  }

  // ── Create user ──────────────────────────────────────────────────────────
  try {
    await superClient.query(`CREATE USER lyceum WITH PASSWORD 'lyceum_pass'`);
    console.log('  ✓ Created user: lyceum');
  } catch (err) {
    if (err.code === '42710') console.log('  ✓ User lyceum already exists');
    else throw err;
  }

  // ── Create database ──────────────────────────────────────────────────────
  try {
    await superClient.query(`CREATE DATABASE lyceum_db OWNER lyceum`);
    console.log('  ✓ Created database: lyceum_db');
  } catch (err) {
    if (err.code === '42P04') console.log('  ✓ Database lyceum_db already exists');
    else throw err;
  }

  await superClient.query(`GRANT ALL PRIVILEGES ON DATABASE lyceum_db TO lyceum`);
  await superClient.end();

  // ── Run migrations as lyceum user ────────────────────────────────────────
  console.log('\n  Running migrations...\n');

  const appClient = new pg.Client({
    connectionString: 'postgresql://lyceum:lyceum_pass@localhost:5432/lyceum_db',
  });

  await appClient.connect();

  await appClient.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const applied = await appClient.query('SELECT filename FROM _migrations ORDER BY filename');
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`    ✓ ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await appClient.query('BEGIN');
    await appClient.query(sql);
    await appClient.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    await appClient.query('COMMIT');
    console.log(`    ✅ ${file}`);
  }

  await appClient.end();

  console.log('\n  Setup complete! Run dev.bat to start Lyceum.\n');
}

main().catch(err => {
  console.error('\n  Setup failed:', err.message, '\n');
  process.exit(1);
});
