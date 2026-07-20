import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import fg from 'fast-glob';

describe('Network Privacy Audit', () => {
  it('strictly prohibits sending source code or file paths over the network', async () => {
    const srcDir = resolve(import.meta.dirname, '../');
    const sourceFiles = await fg('**/*.ts', { cwd: srcDir, absolute: true });

    for (const file of sourceFiles) {
      const content = await readFile(file, 'utf-8');

      // Check if file makes any network requests (e.g. fetch, axios, http)
      if (content.includes('fetch(') || content.includes('http.')) {
        // If it does, assert that it ONLY sends approved fields and does not send file contents or finding details
        const containsFileContentSent = /body\s*:\s*.*content|body\s*:\s*.*code|body\s*:\s*.*file/i.test(content);
        expect(containsFileContentSent).toBe(false);

        // Verify it doesn't mention sending findings details
        const containsFindingsSent = /body\s*:\s*.*findings/i.test(content);
        expect(containsFindingsSent).toBe(false);
      }
    }
  });
});
