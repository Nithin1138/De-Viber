import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { pool, initDb } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory fallback map if DB is offline
const memoryDb = new Map<string, any>();

// GET web scanner GUI
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>De-Viber Web Scanner — Local & Private Code Audit</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #060913;
      --card-bg: rgba(255, 255, 255, 0.03);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-dim: #94a3b8;
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.2);
      --grade-a: #10b981;
      --grade-c: #f59e0b;
      --grade-f: #ef4444;
      --terminal-bg: #03050a;
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
      padding: 3rem 1.5rem;
      background-image: 
        radial-gradient(circle at 10% 10%, rgba(99, 102, 241, 0.07) 0%, transparent 40%),
        radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.04) 0%, transparent 45%);
    }

    .container {
      width: 100%;
      max-width: 900px;
    }

    header {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .logo {
      font-weight: 800;
      font-size: 2.2rem;
      letter-spacing: -0.05em;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #a5b4fc, #34d399);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }

    .subtitle {
      font-size: 1.1rem;
      color: var(--text-dim);
    }

    .badge-private {
      display: inline-block;
      margin-top: 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      background: rgba(16, 185, 129, 0.1);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 2.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      margin-bottom: 2rem;
      position: relative;
      overflow: hidden;
    }

    /* Dropzone Styling */
    .dropzone {
      border: 2px dashed rgba(99, 102, 241, 0.3);
      background: rgba(255, 255, 255, 0.01);
      border-radius: 20px;
      padding: 4rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .dropzone:hover, .dropzone.dragover {
      border-color: var(--primary);
      background: rgba(99, 102, 241, 0.04);
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.1);
    }

    .dropzone-icon {
      font-size: 3.5rem;
      margin-bottom: 1.5rem;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .dropzone-text {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .dropzone-hint {
      font-size: 0.9rem;
      color: var(--text-dim);
      margin-bottom: 1.5rem;
    }

    .btn-primary {
      background: linear-gradient(90deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      padding: 0.75rem 1.75rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
    }

    /* Terminal Console */
    .terminal-console {
      background: var(--terminal-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.25rem;
      font-family: monospace;
      font-size: 0.85rem;
      color: #34d399;
      height: 140px;
      overflow-y: auto;
      text-align: left;
      margin-top: 1.5rem;
    }

    .terminal-line {
      margin-bottom: 0.3rem;
      display: flex;
      gap: 0.75rem;
    }

    .terminal-timestamp {
      color: var(--text-dim);
    }

    /* Results Dashboard */
    .results-dashboard {
      display: none;
    }

    .summary-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .circle-gauge {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 5px solid var(--card-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .circle-grade {
      font-size: 2.2rem;
      font-weight: 800;
      line-height: 1;
    }

    .circle-score {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
    }

    .summary-info h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.3rem;
    }

    .summary-info p {
      font-size: 0.9rem;
      color: var(--text-dim);
    }

    /* Findings list */
    .findings-container {
      width: 100%;
      text-align: left;
    }

    .findings-header {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .finding-item {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      margin-bottom: 0.75rem;
      overflow: hidden;
      transition: background-color 0.2s;
    }

    .finding-item:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .finding-summary {
      padding: 1rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }

    .finding-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .finding-title {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .finding-file {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--text-dim);
    }

    .finding-severity {
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .severity-critical { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .severity-high { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .severity-medium { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .severity-low { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .severity-info { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; }

    .finding-details {
      display: none;
      padding: 1.25rem;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid var(--card-border);
      font-size: 0.9rem;
      color: var(--text-dim);
    }

    .details-action {
      margin-bottom: 1rem;
      color: var(--text-main);
    }

    .details-evidence {
      font-family: monospace;
      background: #04060a;
      padding: 0.75rem;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 0.8rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
      white-space: pre-wrap;
      overflow-x: auto;
    }

    /* Actions Bar */
    .actions-bar {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 2rem;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      border: 1px solid var(--card-border);
      padding: 0.75rem 1.75rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      justify-content: center;
      align-items: center;
      z-index: 100;
    }

    .modal {
      background: #0c101c;
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2.5rem;
      max-width: 500px;
      width: 100%;
      text-align: center;
    }

    .modal h3 {
      font-size: 1.4rem;
      margin-bottom: 1rem;
    }

    .modal p {
      color: var(--text-dim);
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
    }

    .modal-url {
      font-family: monospace;
      background: #04060a;
      padding: 0.8rem;
      border-radius: 8px;
      color: #34d399;
      margin-bottom: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">DE-VIBER WEB SCANNER</div>
      <div class="subtitle">Audit your Lovable & Bolt codebases client-side for vendor lock-in & security risks</div>
      <div><span class="badge-private">🔒 100% Local & Private</span></div>
    </header>

    <!-- Scan Setup Card -->
    <div class="card" id="setup-card">
      <div class="dropzone" onclick="document.getElementById('project-upload').click()">
        <div class="dropzone-icon">📂</div>
        <div class="dropzone-text">Select Exported Project Directory</div>
        <div class="dropzone-hint">Folder analysis occurs entirely in your browser memory. No code is uploaded.</div>
        <button class="btn-primary">Browse Directory</button>
        <input type="file" id="project-upload" webkitdirectory directory multiple style="display: none;" />
      </div>

      <div class="terminal-console" id="terminal" style="display: none;">
        <!-- Terminal log outputs -->
      </div>
    </div>

    <!-- Results Dashboard Card -->
    <div class="results-dashboard" id="dashboard-card">
      <div class="summary-row">
        <!-- Portability -->
        <div class="summary-card">
          <div class="circle-gauge" id="p-gauge">
            <div class="circle-grade" id="p-grade">-</div>
            <div class="circle-score" id="p-score">--/100</div>
          </div>
          <div class="summary-info">
            <h3>Portability Score</h3>
            <p id="p-platform">Source: -</p>
            <p id="p-count">0 lock-in indicators found</p>
          </div>
        </div>

        <!-- Security -->
        <div class="summary-card">
          <div class="circle-gauge" id="s-gauge">
            <div class="circle-grade" id="s-grade">-</div>
            <div class="circle-score" id="s-score">--/100</div>
          </div>
          <div class="summary-info">
            <h3>Security Score</h3>
            <p>Production Readiness</p>
            <p id="s-count">0 warnings detected</p>
          </div>
        </div>
      </div>

      <!-- Findings List Card -->
      <div class="card">
        <div class="findings-header">
          <span>Audit Findings</span>
          <span id="total-findings-count" style="color: var(--text-dim); font-size: 0.9rem;">0 total</span>
        </div>
        <div class="findings-container" id="findings-list">
          <!-- Dynamic findings -->
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="actions-bar">
        <button class="btn-secondary" onclick="resetScanner()">🔄 Rescan</button>
        <button class="btn-secondary" id="btn-report">📋 Download B2B Report</button>
        <button class="btn-primary" id="btn-share">🔗 Share Score Dashboard</button>
      </div>
    </div>
  </div>

  <!-- Share URL Modal -->
  <div class="modal-overlay" id="share-modal">
    <div class="modal">
      <h3>🚀 Score Shared Successfully!</h3>
      <p>Only your score numbers and issue factors have been shared. Source code remains 100% private.</p>
      <div class="modal-url" id="modal-link">-</div>
      <button class="btn-primary" onclick="copyShareUrl()">Copy URL & Close</button>
    </div>
  </div>

  <script>
    const uploadInput = document.getElementById('project-upload');
    const setupCard = document.getElementById('setup-card');
    const terminal = document.getElementById('terminal');
    const dashboardCard = document.getElementById('dashboard-card');
    const findingsList = document.getElementById('findings-list');

    let activeReport = null;

    uploadInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setupCard.querySelector('.dropzone').style.display = 'none';
      terminal.style.display = 'block';
      terminal.innerHTML = '';

      try {
        await startScan(files);
      } catch (err) {
        log('Fatal error during scan: ' + err.message, 'error');
      }
    });

    function log(message, type = 'info') {
      const line = document.createElement('div');
      line.className = 'terminal-line';
      if (type === 'error') line.style.color = '#f87171';
      
      const ts = new Date().toLocaleTimeString();
      line.innerHTML = \`<span class="terminal-timestamp">[\${ts}]</span> <span>\${message}</span>\`;
      terminal.appendChild(line);
      terminal.scrollTop = terminal.scrollHeight;
    }

    async function startScan(files) {
      log('Filtering files...');
      const targetFiles = Array.from(files).filter(f => {
        const path = f.webkitRelativePath.toLowerCase();
        return !path.includes('node_modules') && 
               !path.includes('.git') && 
               !path.includes('dist/') && 
               !path.includes('build/') &&
               !path.includes('.next/');
      });

      log(\`Discovered \${targetFiles.length} files. Starting rules evaluation...\`);

      let packageJson = {};
      let projectName = 'web-scanned-project';
      let packageJsonFile = targetFiles.find(f => f.name === 'package.json');
      
      if (packageJsonFile) {
        try {
          packageJson = JSON.parse(await packageJsonFile.text());
          projectName = packageJson.name || projectName;
          log(\`Loaded package.json for project "\${projectName}"\`);
        } catch (err) {
          log('Failed to parse package.json: ' + err.message, 'error');
        }
      }

      // Platform Detection
      let detectedPlatform = 'lovable';
      let hasBolt = targetFiles.some(f => f.webkitRelativePath.includes('.bolt')) ||
                    (packageJson.dependencies && Object.keys(packageJson.dependencies).some(k => k.includes('bolt')));
      if (hasBolt) detectedPlatform = 'bolt';
      log(\`Detected Platform: \${detectedPlatform.toUpperCase()}\`);

      const findings = [];

      // Evaluate rules for each file
      for (const file of targetFiles) {
        // Remove root folder from path
        const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
        if (!relativePath) continue;

        const isCode = relativePath.endsWith('.ts') || relativePath.endsWith('.tsx') || relativePath.endsWith('.js') || relativePath.endsWith('.jsx');
        const isSql = relativePath.endsWith('.sql');

        if (file.name === 'package.json') {
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
          for (const [depName, depVer] of Object.entries(deps)) {
            if (depName.startsWith('@lovable.dev') || depName === 'lovable-tagger') {
              findings.push({
                id: 'PORT_PROPRIETARY_001',
                category: 'portability',
                severity: 'high',
                file: relativePath,
                line: 1,
                message: \`Proprietary platform dependency: \${depName}\`,
                userActionableMessage: \`Replace dependency "\${depName}" with an open-source equivalent.\`,
                evidence: \`"\${depName}": "\${depVer}"\`
              });
            }
          }
        }

        if (relativePath.includes('.lovable/')) {
          findings.push({
            id: 'PORT_CONFIG_001',
            category: 'portability',
            severity: 'high',
            file: relativePath,
            line: 1,
            message: 'Lovable platform configuration directory/file',
            userActionableMessage: 'Platform config files can be safely deleted when migrating to standard hosts.',
            evidence: \`Path: \${relativePath}\`
          });
        }

        if (isCode) {
          const content = await file.text();
          const lines = content.split('\\n');

          // Check line by line
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Hardcoded keys
            if (/sk_test_[a-zA-Z0-9]{24,}/.test(line) || /sk_live_[a-zA-Z0-9]{24,}/.test(line)) {
              findings.push({
                id: 'SEC_HARDCODED_SECRET_001',
                category: 'security',
                severity: 'critical',
                file: relativePath,
                line: i + 1,
                message: 'Hardcoded Stripe Secret API Key',
                userActionableMessage: '⚠️ CRITICAL SECURITY RISK: Move the Stripe API Key to your server-side environment variables (.env). Never commit API keys to version control.',
                evidence: line.trim()
              });
            }

            if (/eyJhbGciOi/.test(line)) {
              findings.push({
                id: 'SEC_HARDCODED_SECRET_001',
                category: 'security',
                severity: 'critical',
                file: relativePath,
                line: i + 1,
                message: 'Hardcoded JWT secret token',
                userActionableMessage: '⚠️ CRITICAL SECURITY RISK: Move this JWT secret token to your server-side environment variables.',
                evidence: line.trim()
              });
            }

            // Lovable comment markers
            if (line.includes('@lovable-generated') || line.includes('// @lovable')) {
              findings.push({
                id: 'PORT_MARKER_001',
                category: 'portability',
                severity: 'info',
                file: relativePath,
                line: i + 1,
                message: 'Lovable AI code generator marker comment',
                userActionableMessage: 'AI-generated comment code marker. Verified safe, but consider clean up.',
                evidence: line.trim()
              });
            }

            // Supabase Lovable cloud DB endpoint
            if (line.includes('supabase.lovable.app')) {
              findings.push({
                id: 'PORT_CLOUD_DATA_001',
                category: 'portability',
                severity: 'critical',
                file: relativePath,
                line: i + 1,
                message: 'Connection URL points to Lovable-managed Supabase database',
                userActionableMessage: '⚠️ DATA LOSS WARNING: Your project points to a Lovable-managed Supabase database. Export all database schemas/records, and configure your own database before the project expires.',
                evidence: line.trim()
              });
            }
          }

          // IDOR queries check (rough query chains parser)
          let chainBuffer = '';
          let chainStartLine = 0;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

            if (/\.from\s*\(/.test(line)) {
              chainBuffer = line;
              chainStartLine = i;
            } else if (chainBuffer) {
              if (trimmed.startsWith('.') || trimmed.startsWith('await') || chainBuffer.endsWith('.')) {
                chainBuffer += ' ' + line;
              } else {
                evaluateChain(chainBuffer, chainStartLine + 1, relativePath, findings);
                chainBuffer = '';
              }
            }
          }
          if (chainBuffer) {
            evaluateChain(chainBuffer, chainStartLine + 1, relativePath, findings);
          }
        }

        if (isSql) {
          const content = await file.text();
          const hasCreateTable = content.toLowerCase().includes('create table');
          const hasEnableRls = content.toLowerCase().includes('enable row level security');
          if (hasCreateTable && !hasEnableRls) {
            findings.push({
              id: 'SEC_MISSING_RLS_001',
              category: 'security',
              severity: 'high',
              file: relativePath,
              line: 1,
              message: 'Missing Row Level Security (RLS) on DB tables',
              userActionableMessage: 'Database tables must have RLS enabled and access policies configured to protect records from public access.',
              evidence: 'No "ENABLE ROW LEVEL SECURITY" found'
            });
          }
        }
      }

      // Calculate scores
      const pFindings = findings.filter(f => f.category === 'portability');
      const sFindings = findings.filter(f => f.category === 'security');

      const pScore = calculateScore(pFindings);
      const sScore = calculateScore(sFindings);
      const pGrade = getGrade(pScore);
      const sGrade = getGrade(sScore);

      activeReport = {
        projectName,
        detectedPlatform,
        timestamp: new Date().toISOString(),
        cliVersion: 'web-1.0.0',
        portabilityScore: { score: pScore, grade: pGrade, findingsCount: pFindings.length },
        securityScore: { score: sScore, grade: sGrade, findingsCount: sFindings.length },
        findings
      };

      log('Audit successfully completed!');
      
      // Delay slightly so logs are readable
      setTimeout(() => {
        setupCard.style.display = 'none';
        dashboardCard.style.display = 'block';
        renderResults();
      }, 800);
    }

    function evaluateChain(chain, line, file, findings) {
      const hasFrom = /\.from\s*\(\s*['"\`]\w+['"\`]\s*\)/.test(chain);
      const hasIdEq = /\.eq\s*\(\s*['"\`]id['"\`]/.test(chain) || 
                      /\.filter\s*\(\s*['"\`]id['"\`]/.test(chain) ||
                      /\.match\s*\(\s*\{\s*id\s*:/.test(chain);
      if (hasFrom && hasIdEq) {
        const hasUserFilter = /\.eq\s*\(\s*['"\`](?:user_id|owner_id|created_by|author_id)['"\`]/.test(chain) ||
                              /auth\.uid\s*\(\s*\)/.test(chain) ||
                              /user\.id/.test(chain) ||
                              /userId/.test(chain);
        if (!hasUserFilter) {
          findings.push({
            id: 'SEC_POSSIBLE_IDOR_001',
            category: 'security',
            severity: 'medium',
            file: file,
            line: line,
            message: 'Query filters by ID but may not verify resource ownership',
            userActionableMessage: '⚠️ POSSIBLE IDOR: This database query filters by an ID, but does not check that the requesting user owns the resource. Ensure Row Level Security (RLS) is enabled or add an explicit user_id filter.',
            evidence: chain.trim()
          });
        }
      }
    }

    function calculateScore(findings) {
      let score = 100;
      findings.forEach(f => {
        if (f.severity === 'critical') score -= 20;
        else if (f.severity === 'high') score -= 15;
        else if (f.severity === 'medium') score -= 8;
        else if (f.severity === 'low') score -= 3;
        else if (f.severity === 'info') score -= 1;
      });
      return Math.max(0, score);
    }

    function getGrade(score) {
      if (score >= 90) return 'A';
      if (score >= 80) return 'B';
      if (score >= 70) return 'C';
      if (score >= 60) return 'D';
      return 'F';
    }

    function renderResults() {
      const data = activeReport;
      
      // Update score circles
      document.getElementById('p-grade').innerText = data.portabilityScore.grade;
      document.getElementById('p-score').innerText = \`\${data.portabilityScore.score}/100\`;
      document.getElementById('p-platform').innerText = \`Source Platform: \${data.detectedPlatform.toUpperCase()}\`;
      document.getElementById('p-count').innerText = \`\${data.portabilityScore.findingsCount} lock-in indicators found\`;

      document.getElementById('s-grade').innerText = data.securityScore.grade;
      document.getElementById('s-score').innerText = \`\${data.securityScore.score}/100\`;
      document.getElementById('s-count').innerText = \`\${data.securityScore.findingsCount} warnings detected\`;

      document.getElementById('total-findings-count').innerText = \`\${data.findings.length} total findings\`;

      // Set colors
      document.getElementById('p-gauge').style.borderColor = getGradeColor(data.portabilityScore.grade);
      document.getElementById('s-gauge').style.borderColor = getGradeColor(data.securityScore.grade);

      // Render findings
      findingsList.innerHTML = '';
      if (data.findings.length === 0) {
        findingsList.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 2rem;">No findings detected! Your project is highly portable & secure.</div>';
        return;
      }

      data.findings.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = 'finding-item';

        const summary = document.createElement('div');
        summary.className = 'finding-summary';
        summary.onclick = () => toggleDetails(idx);

        const meta = document.createElement('div');
        meta.className = 'finding-meta';
        
        const badge = document.createElement('span');
        badge.className = \`finding-severity severity-\${f.severity}\`;
        badge.innerText = f.severity;

        const fileSpan = document.createElement('span');
        fileSpan.className = 'finding-file';
        fileSpan.innerText = \`\${f.file.split('/').pop()}:\${f.line}\`;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'finding-title';
        titleSpan.innerText = f.message;

        meta.appendChild(badge);
        meta.appendChild(fileSpan);
        meta.appendChild(titleSpan);

        const arrow = document.createElement('span');
        arrow.id = \`arrow-\${idx}\`;
        arrow.innerText = '▼';
        arrow.style.fontSize = '0.75rem';
        arrow.style.color = 'var(--text-dim)';

        summary.appendChild(meta);
        summary.appendChild(arrow);

        const details = document.createElement('div');
        details.id = \`details-\${idx}\`;
        details.className = 'finding-details';

        const actionDiv = document.createElement('div');
        actionDiv.className = 'details-action';
        actionDiv.innerText = f.userActionableMessage;

        const evidencePre = document.createElement('pre');
        evidencePre.className = 'details-evidence';
        evidencePre.innerText = f.evidence;

        details.appendChild(actionDiv);
        details.appendChild(evidencePre);

        item.appendChild(summary);
        item.appendChild(details);
        findingsList.appendChild(item);
      });

      // Hook action buttons
      document.getElementById('btn-report').onclick = triggerReportDownload;
      document.getElementById('btn-share').onclick = triggerScoreSharing;
    }

    function toggleDetails(idx) {
      const details = document.getElementById(\`details-\${idx}\`);
      const arrow = document.getElementById(\`arrow-\${idx}\`);
      if (details.style.display === 'block') {
        details.style.display = 'none';
        arrow.innerText = '▼';
      } else {
        details.style.display = 'block';
        arrow.innerText = '▲';
      }
    }

    function getGradeColor(grade) {
      if (['A', 'B'].includes(grade)) return 'var(--grade-a)';
      if (['C', 'D'].includes(grade)) return 'var(--grade-c)';
      return 'var(--grade-f)';
    }

    function resetScanner() {
      activeReport = null;
      dashboardCard.style.display = 'none';
      setupCard.style.display = 'block';
      setupCard.querySelector('.dropzone').style.display = 'flex';
      terminal.style.display = 'none';
      uploadInput.value = '';
    }

    function triggerReportDownload() {
      const data = activeReport;
      if (!data) return;

      // Generate B2B report locally (matches src/report/diligence.ts logic)
      let totalHours = 0;
      let roadmapRows = '';

      data.findings.forEach((f, idx) => {
        let hours = 0.5;
        let action = '';
        if (f.category === 'portability') {
          if (f.severity === 'critical') { hours = 8; action = 'Export database schema & data from Lovable cloud.'; }
          else if (f.severity === 'high') { hours = 4; action = 'Replace proprietary platform dependencies.'; }
          else if (f.severity === 'medium') { hours = 2; action = 'Modify custom configuration settings.'; }
          else { hours = 0.5; action = 'Clean up generator comment markers.'; }
        } else {
          if (f.severity === 'critical') { hours = 8; action = 'Remediate hardcoded key vulnerabilities.'; }
          else if (f.severity === 'high') { hours = 4; action = 'Configure auth session verification.'; }
          else if (f.severity === 'medium') { hours = 2; action = 'Verify table Row Level Security (RLS).'; }
          else { hours = 0.5; action = 'Check client validation rules.'; }
        }
        totalHours += hours;

        roadmapRows += \`| \${idx + 1} | \`\${f.category}\` | **\${f.severity.toUpperCase()}** | \`\${hours}h\` | Found in \`\${f.file.split('/').pop()}\`: \${f.message} | \${action} |\\n\`;
      });

      const pScore = data.portabilityScore.score;
      const sScore = data.securityScore.score;
      const pGrade = data.portabilityScore.grade;
      const sGrade = data.securityScore.grade;

      let effortScale = 'Low Effort';
      if (totalHours > 20) effortScale = 'High Effort';
      else if (totalHours > 8) effortScale = 'Moderate Effort';

      let narrative = '';
      if (pScore >= 80 && sScore >= 80) {
        narrative = \`The codebase for "\${data.projectName}" displays a strong posture for independent hosting and production readiness, achieving a Portability grade of \${pGrade} (\${pScore}/100) and a Security grade of \${sGrade} (\${sScore}/100).\`;
      } else {
        narrative = \`The codebase for "\${data.projectName}" is moderately portable, with a Portability grade of \${pGrade} (\${pScore}/100) and a Security grade of \${sGrade} (\${sScore}/100). Review the Roadmap below for details.\`;
      }

      const markdown = \`# 🏢 B2B Due Diligence & Portability Report

**Project Name:** \\\`\${data.projectName}\\\`
**Date Generated:** \${new Date().toLocaleDateString()}
**Source Platform:** \\\`\${data.detectedPlatform}\\\`

---

## 📊 Executive Summary

\${narrative}

### ⏱️ Migration Estimations
- **Estimated Effort:** \\\`\${totalHours} Hours\\\` (\${effortScale})
- **Total Findings:** \\\`\${data.findings.length}\\\`

---

## 🛡️ Risk & Posture Scorecard

| Dimension | Score | Grade | Status |
|---|---|---|---|
| **Portability (Lock-in)** | \\\`\${pScore}/100\\\` | **\${pGrade}** | \${pScore >= 80 ? '✅ Ready' : '⚠️ Caution'} |
| **Security (Readiness)** | \\\`\${sScore}/100\\\` | **\${sGrade}** | \${sScore >= 80 ? '✅ Ready' : '⚠️ Caution'} |

## 🗺️ Remediation Roadmap

| Step | Dimension | Severity | Estimated Effort | Description | Action Item |
|---|---|---|---|---|---|
\${roadmapRows}
\`;

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`\${data.projectName}_due_diligence.md\`;
      a.click();
    }

    async function triggerScoreSharing() {
      const data = activeReport;
      if (!data) return;

      const btn = document.getElementById('btn-share');
      btn.innerText = '⏳ Sharing...';
      btn.disabled = true;

      // Compute projectNameHash using simple SHA-256 equivalent or dummy hash client-side
      const hashInput = data.projectName;
      let projectNameHash = 'web-scanned-' + btoa(hashInput).slice(0, 16);
      
      const payload = {
        projectNameHash,
        platform: data.detectedPlatform,
        overallScore: data.portabilityScore.score,
        lockInSeverity: data.portabilityScore.findingsCount > 0 ? 'high' : 'medium',
        codeQualityScore: data.securityScore.score,
        grade: data.portabilityScore.grade,
        factors: data.findings.map(f => ({
          name: f.message,
          weight: f.severity === 'critical' ? 20 : f.severity === 'high' ? 15 : 8,
          detectedCount: 1,
          severity: f.severity
        }))
      };

      try {
        const res = await fetch('/api/scans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);
        const result = await res.json();
        
        const shareLink = window.location.origin + '/shares/' + result.id;
        document.getElementById('modal-link').innerText = shareLink;
        document.getElementById('share-modal').style.display = 'flex';
      } catch (err) {
        alert('Failed to share score: ' + err.message);
      } finally {
        btn.innerText = '🔗 Share Score Dashboard';
        btn.disabled = false;
      }
    }

    function copyShareUrl() {
      const urlText = document.getElementById('modal-link').innerText;
      navigator.clipboard.writeText(urlText).then(() => {
        alert('URL copied to clipboard!');
        document.getElementById('share-modal').style.display = 'none';
      });
    }
  </script>
</body>
</html>
  `;
  res.send(html);
});

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
