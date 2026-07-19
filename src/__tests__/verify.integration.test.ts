import { describe, it, expect, beforeAll } from 'vitest';
import { DockerVerifier } from '../verifier/dockerVerifier.js';
import { resolve } from 'node:path';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test-fixtures');

describe('Docker Verifier Integration Tests', () => {
  let verifier: DockerVerifier;
  let dockerAvailable = false;

  beforeAll(async () => {
    verifier = new DockerVerifier();
    try {
      await verifier.checkDockerStatus();
      dockerAvailable = true;
    } catch {
      console.warn('⚠️ Docker daemon is not running. Skipping integration tests.');
    }
  });

  it('verifies identity PASS case for frontend-only fixture', async () => {
    if (!dockerAvailable) return;

    const path = resolve(FIXTURES_ROOT, 'frontend-only');
    const result = await verifier.verifyPath(path, 'frontend-only', 'test-identity', 60);

    expect(result.built).toBe(true);
    expect(result.routesChecked).toHaveLength(1);
    expect(result.routesChecked[0].route).toBe('/');
    expect(result.routesChecked[0].success).toBe(true);

    const diff = verifier.compare(result, result);
    expect(diff.pass).toBe(true);
    expect(diff.regressions).toHaveLength(0);
  });

  it('detects a broken build in broken-build fixture', async () => {
    if (!dockerAvailable) return;

    const path = resolve(FIXTURES_ROOT, 'broken-build');
    const result = await verifier.verifyPath(path, 'broken-build', 'test-broken', 60);

    expect(result.built).toBe(false);
    expect(result.buildError).toBeDefined();

    // Verify baseline vs broken current fails
    const cleanPath = resolve(FIXTURES_ROOT, 'frontend-only');
    const cleanResult = await verifier.verifyPath(cleanPath, 'frontend-only', 'test-clean', 60);

    const diff = verifier.compare(cleanResult, result);
    expect(diff.pass).toBe(false);
    expect(diff.regressions.some(r => r.includes('Build failed') || r.includes('failed'))).toBe(true);
  });

  it('detects failing tests in failing-test fixture', async () => {
    if (!dockerAvailable) return;

    const path = resolve(FIXTURES_ROOT, 'failing-test');
    const result = await verifier.verifyPath(path, 'failing-test', 'test-failing', 60);

    expect(result.built).toBe(true);
    expect(result.testPassed).toBe(false);
    expect(result.testFailedCount).toBeGreaterThan(0);
  });
});
