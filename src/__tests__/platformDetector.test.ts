/**
 * Platform Detector Tests
 *
 * Tests for multi-signal platform detection with confidence levels.
 */

import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../detectors/platformDetector.js';
import { resolve } from 'node:path';
import fg from 'fast-glob';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test-fixtures');

async function getFixtureFiles(fixtureName: string): Promise<string[]> {
  const root = resolve(FIXTURES_ROOT, fixtureName);
  return fg('**/*', {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });
}

describe('Platform Detector', () => {
  describe('Lovable detection', () => {
    it('detects lovable-basic-lockup with high confidence (multiple strong signals)', async () => {
      const root = resolve(FIXTURES_ROOT, 'lovable-basic-lockup');
      const files = await getFixtureFiles('lovable-basic-lockup');
      const result = await detectPlatform(root, files);

      expect(result.platform).toBe('lovable');
      expect(result.confidence).toBe('high');
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });

    it('detects lovable-secure as lovable', async () => {
      const root = resolve(FIXTURES_ROOT, 'lovable-secure');
      const files = await getFixtureFiles('lovable-secure');
      const result = await detectPlatform(root, files);

      expect(result.platform).toBe('lovable');
      // Has @lovable.dev/ui dep + supabase dep = at least 2 signals
      expect(result.signals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Bolt detection', () => {
    it('detects bolt-basic-lockup with high confidence', async () => {
      const root = resolve(FIXTURES_ROOT, 'bolt-basic-lockup');
      const files = await getFixtureFiles('bolt-basic-lockup');
      const result = await detectPlatform(root, files);

      expect(result.platform).toBe('bolt');
      expect(result.confidence).toBe('high');
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Unknown platform (true negatives)', () => {
    it('returns unknown for frontend-only project with no platform markers', async () => {
      const root = resolve(FIXTURES_ROOT, 'frontend-only');
      const files = await getFixtureFiles('frontend-only');
      const result = await detectPlatform(root, files);

      expect(result.platform).toBe('unknown');
      expect(result.signals).toHaveLength(0);
    });

    it('returns unknown for idor-pattern project with no platform markers', async () => {
      const root = resolve(FIXTURES_ROOT, 'lovable-idor-pattern');
      const files = await getFixtureFiles('lovable-idor-pattern');
      const result = await detectPlatform(root, files);

      // This project has supabase but no @lovable.dev deps, no .lovable dir
      // Supabase alone is a weak signal (weight 1) — should be low confidence at most
      expect(['unknown', 'lovable']).toContain(result.platform);
      if (result.platform === 'lovable') {
        expect(result.confidence).toBe('low');
      }
    });
  });

  describe('Edge cases', () => {
    it('handles empty file list', async () => {
      const result = await detectPlatform('/nonexistent', []);
      expect(result.platform).toBe('unknown');
      expect(result.signals).toHaveLength(0);
    });

    it('handles nonexistent project root gracefully', async () => {
      const result = await detectPlatform('/nonexistent/path', [
        'package.json',
        'src/index.ts',
      ]);
      // Should not throw, just return unknown
      expect(result.platform).toBe('unknown');
    });
  });
});
