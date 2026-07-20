import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/deviber',
});

export async function initDb(): Promise<void> {
  const schema = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scan_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      project_name_hash VARCHAR(64) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      is_public BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portability_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scan_submission_id UUID REFERENCES scan_submissions(id) ON DELETE CASCADE,
      overall_score INT NOT NULL,
      lock_in_severity VARCHAR(50) NOT NULL,
      code_quality_score INT NOT NULL,
      grade VARCHAR(2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS score_factors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      portability_score_id UUID REFERENCES portability_scores(id) ON DELETE CASCADE,
      factor_name VARCHAR(255) NOT NULL,
      weight INT NOT NULL,
      detected_count INT NOT NULL,
      severity VARCHAR(50) NOT NULL
    );
  `;
  
  // If we are running in an environment where we can connect to the DB, run the schema setup.
  // Otherwise, we skip so the server doesn't crash if DB is not reachable immediately (e.g. in environments without DB)
  try {
    const client = await pool.connect();
    client.release();
    await pool.query(schema);
    console.log('Database initialized successfully.');
  } catch (err: any) {
    console.warn(`Database connection skipped/failed: ${err.message}. (Server will run in database-fallback mode)`);
  }
}
