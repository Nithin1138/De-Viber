import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../index.js';
import { Server } from 'http';

describe('De-Viber Server API', () => {
  let server: Server;
  let serverUrl: string;

  beforeAll(() => {
    return new Promise<void>((resolve) => {
      // Listen on a random free port
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('can submit a score and retrieve it', async () => {
    const payload = {
      projectNameHash: 'abc123hash',
      platform: 'lovable',
      overallScore: 85,
      lockInSeverity: 'medium',
      codeQualityScore: 90,
      grade: 'B',
      factors: [
        { name: 'Hardcoded Secrets', weight: 10, detectedCount: 1, severity: 'high' }
      ]
    };

    const postRes = await fetch(`${serverUrl}/api/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(postRes.status).toBe(201);
    const postData = await postRes.json() as { id: string };
    expect(postData.id).toBeDefined();

    const getRes = await fetch(`${serverUrl}/api/scans/${postData.id}`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json() as any;
    expect(getData.projectNameHash).toBe('abc123hash');
    expect(getData.grade).toBe('B');
    expect(getData.overallScore).toBe(85);
    expect(getData.factors.length).toBe(1);
  });
});
