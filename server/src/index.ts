import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { pool, initDb } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory fallback map if DB is offline
const memoryDb = new Map<string, any>();

// GET share view page
app.get('/shares/:id', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>De-Viber Portability Score Sharing</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #080c14;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-dim: #94a3b8;
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.15);
      --grade-a: #10b981;
      --grade-b: #10b981;
      --grade-c: #f59e0b;
      --grade-d: #f59e0b;
      --grade-f: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 45%);
    }

    .container {
      width: 100%;
      max-width: 580px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 3rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--primary), #10b981);
    }

    .logo {
      font-weight: 800;
      font-size: 1.8rem;
      letter-spacing: -0.05em;
      margin-bottom: 2rem;
      background: linear-gradient(90deg, #a5b4fc, #34d399);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .score-circle {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      border: 6px solid var(--card-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
      position: relative;
      box-shadow: 0 0 30px var(--primary-glow);
    }

    .grade {
      font-size: 4.5rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 0.2rem;
    }

    .score-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .project-meta {
      margin-bottom: 2.5rem;
    }

    .project-hash {
      font-family: monospace;
      font-size: 0.9rem;
      color: var(--text-dim);
      background: rgba(255, 255, 255, 0.05);
      padding: 0.3rem 0.8rem;
      border-radius: 8px;
      margin-top: 0.5rem;
      display: inline-block;
    }

    .platform-badge {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
      display: inline-block;
      margin-top: 0.5rem;
    }

    .factors-list {
      width: 100%;
      text-align: left;
      margin-bottom: 2.5rem;
    }

    .factors-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.5rem;
    }

    .factor-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .factor-name {
      font-size: 1rem;
      font-weight: 400;
    }

    .factor-badge {
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .badge-critical { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-high { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-medium { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .badge-low { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .badge-info { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; }

    .cta-box {
      width: 100%;
      background: rgba(255, 255, 255, 0.01);
      border: 1px dashed var(--card-border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-top: 1rem;
    }

    .cta-text {
      font-size: 0.95rem;
      color: var(--text-dim);
      margin-bottom: 1rem;
    }

    .code-snippet {
      font-family: monospace;
      background: #04060a;
      padding: 0.8rem;
      border-radius: 8px;
      color: #34d399;
      font-size: 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
      user-select: all;
    }

    .error-container {
      display: none;
      text-align: center;
      padding: 2rem;
    }

    .error-title {
      font-size: 1.5rem;
      color: #ef4444;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card" id="main-card">
      <div class="logo">DE-VIBER</div>
      
      <div class="score-circle" id="circle">
        <div class="grade" id="grade-letter">-</div>
        <div class="score-label" id="score-val">--/100</div>
      </div>

      <div class="project-meta">
        <h2>Portability Score</h2>
        <div class="platform-badge" id="platform-name">Platform: -</div>
        <br>
        <span class="project-hash" id="proj-hash">Project Hash: -</span>
      </div>

      <div class="factors-list">
        <div class="factors-title">Score Impacting Factors</div>
        <div id="factors-container">
          <!-- Dynamically populated -->
        </div>
      </div>

      <div class="cta-box">
        <div class="cta-text">Audit your own AI-generated codebase offline for vendor lock-in & security risks:</div>
        <div class="code-snippet">npx deviber-cli@latest analyse .</div>
      </div>
    </div>

    <div class="card error-container" id="error-card">
      <div class="error-title">Score Not Found</div>
      <p class="cta-text">The requested score share could not be found or has expired.</p>
    </div>
  </div>

  <script>
    async function loadScore() {
      const pathParts = window.location.pathname.split('/');
      const id = pathParts[pathParts.length - 1];

      try {
        const res = await fetch(\`/api/scans/\${id}\`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();

        // Populate values
        document.getElementById('grade-letter').innerText = data.grade;
        document.getElementById('score-val').innerText = \`\${data.overallScore}/100\`;
        document.getElementById('platform-name').innerText = \`Source Platform: \${data.platform}\`;
        document.getElementById('proj-hash').innerText = \`Project: \${data.projectNameHash.slice(0, 12)}...\`;

        // Color grade circle
        const circle = document.getElementById('circle');
        let color = 'var(--grade-c)';
        if (['A', 'B'].includes(data.grade)) color = 'var(--grade-a)';
        else if (data.grade === 'F') color = 'var(--grade-f)';
        circle.style.borderColor = color;

        // Populate factors
        const container = document.getElementById('factors-container');
        container.innerHTML = '';
        
        if (!data.factors || data.factors.length === 0) {
          container.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No major lock-in or security issues detected!</div>';
        } else {
          data.factors.forEach(f => {
            const item = document.createElement('div');
            item.className = 'factor-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'factor-name';
            nameSpan.innerText = f.name || f.factor_name;

            const badgeSpan = document.createElement('span');
            const sev = (f.severity || 'info').toLowerCase();
            badgeSpan.className = \`factor-badge badge-\${sev}\`;
            badgeSpan.innerText = \`\${sev} (\${f.detectedCount || f.detected_count})\`;

            item.appendChild(nameSpan);
            item.appendChild(badgeSpan);
            container.appendChild(item);
          });
        }
      } catch (err) {
        document.getElementById('main-card').style.display = 'none';
        document.getElementById('error-card').style.display = 'flex';
      }
    }

    loadScore();
  </script>
</body>
</html>
  `;
  res.send(html);
});

// GET raw JSON endpoint
app.get('/api/scans/:id', async (req, res) => {
  const { id } = req.params;

  // Try in-memory db first
  if (memoryDb.has(id)) {
    return res.json(memoryDb.get(id));
  }

  // Fallback to PostgreSQL
  try {
    const submissionResult = await pool.query(
      `SELECT s.project_name_hash, s.platform, p.overall_score, p.lock_in_severity, p.code_quality_score, p.grade, p.id as score_id
       FROM scan_submissions s
       JOIN portability_scores p ON p.scan_submission_id = s.id
       WHERE s.id = $1`,
      [id]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const row = submissionResult.rows[0];
    const factorsResult = await pool.query(
      `SELECT factor_name, weight, detected_count, severity
       FROM score_factors
       WHERE portability_score_id = $1`,
      [row.score_id]
    );

    res.json({
      id,
      projectNameHash: row.project_name_hash,
      platform: row.platform,
      overallScore: row.overall_score,
      lockInSeverity: row.lock_in_severity,
      codeQualityScore: row.code_quality_score,
      grade: row.grade,
      factors: factorsResult.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Database error: ${err.message}` });
  }
});

// POST endpoint to share a score
app.post('/api/scans', async (req, res) => {
  const {
    projectNameHash,
    platform,
    overallScore,
    lockInSeverity,
    codeQualityScore,
    grade,
    factors = [],
  } = req.body;

  if (!projectNameHash || !platform || overallScore === undefined || !grade) {
    return res.status(400).json({ error: 'Missing required payload parameters' });
  }

  const id = crypto.randomUUID();

  // Try PostgreSQL
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const subRes = await client.query(
        `INSERT INTO scan_submissions (id, project_name_hash, platform)
         VALUES ($1, $2, $3) RETURNING id`,
        [id, projectNameHash, platform]
      );

      const scoreRes = await client.query(
        `INSERT INTO portability_scores (scan_submission_id, overall_score, lock_in_severity, code_quality_score, grade)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [id, overallScore, lockInSeverity || 'medium', codeQualityScore || 100, grade]
      );

      const scoreId = scoreRes.rows[0].id;

      for (const f of factors) {
        await client.query(
          `INSERT INTO score_factors (portability_score_id, factor_name, weight, detected_count, severity)
           VALUES ($1, $2, $3, $4, $5)`,
          [scoreId, f.name || f.factor_name, f.weight || 0, f.detectedCount || f.detected_count || 0, f.severity || 'info']
        );
      }

      await client.query('COMMIT');
      client.release();
      return res.status(201).json({ id });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      client.release();
      throw dbErr;
    }
  } catch (err: any) {
    // If Postgres is down, fallback to memory storage (ensures robust offline testing)
    console.warn('Storing shared score in memory fallback:', err.message);
    memoryDb.set(id, {
      id,
      projectNameHash,
      platform,
      overallScore,
      lockInSeverity,
      codeQualityScore,
      grade,
      factors,
    });
    return res.status(201).json({ id });
  }
});

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`De-Viber server running on port ${PORT}`);
  });
});

export { app }; // For testing
