/**
 * Platform Detector — Multi-Signal Platform Fingerprinting
 *
 * Identifies which AI app-builder platform (Lovable, Bolt, Replit) a project
 * was exported from, using multiple filesystem and content signals.
 *
 * Returns a confidence level, not just a single guess, because:
 * - A project may have ambiguous signals (e.g., imported from one platform to another)
 * - Single-signal detection is brittle and produces false positives
 * - The user should know when detection is uncertain and can override with --platform
 *
 * IMPORTANT: This detector NEVER makes network calls to any platform's servers.
 * All detection is purely from local file/content fingerprints.
 */

import type {
  Platform,
  PlatformDetection,
  DetectionSignal,
  Confidence,
} from '../types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Signal Definitions ─────────────────────────────────────────────────────

interface PlatformSignalCheck {
  platform: Platform;
  type: string;
  detail: string;
  weight: number;
  check: (projectRoot: string, files: string[]) => Promise<boolean>;
}

/**
 * Read and parse a file, returning null on any error.
 * Intentionally does not throw — callers handle null.
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function safeParseJson(filePath: string): Promise<Record<string, unknown> | null> {
  const content = await safeReadFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Lovable Signals ────────────────────────────────────────────────────────

const lovableSignals: PlatformSignalCheck[] = [
  {
    platform: 'lovable',
    type: 'package.json dependency',
    detail: '@lovable.dev/* or lovable-tagger package found',
    weight: 3,
    check: async (root) => {
      const pkg = await safeParseJson(join(root, 'package.json'));
      if (!pkg) return false;
      const allDeps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      return Object.keys(allDeps).some((dep) => dep.startsWith('@lovable.dev/') || dep === 'lovable-tagger');
    },
  },
  {
    platform: 'lovable',
    type: 'config file',
    detail: 'lovable.config.ts or .lovable directory found',
    weight: 3,
    check: async (_root, files) => {
      return files.some(
        (f) =>
          f === 'lovable.config.ts' ||
          f === 'lovable.config.js' ||
          f.startsWith('.lovable/') ||
          f.startsWith('.lovable\\')
      );
    },
  },
  {
    platform: 'lovable',
    type: 'content marker',
    detail: 'Lovable/GPT-Pilot comment markers in source files',
    weight: 1,
    check: async (root, files) => {
      const tsFiles = files.filter(
        (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
      );
      // Sample up to 20 files to avoid scanning the entire project
      const sample = tsFiles.slice(0, 20);
      for (const f of sample) {
        const content = await safeReadFile(join(root, f));
        if (content && /lovable|gpt-?pilot/i.test(content)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    platform: 'lovable',
    type: 'supabase integration',
    detail: 'Supabase client configured with Lovable patterns',
    weight: 1,
    check: async (root) => {
      const pkg = await safeParseJson(join(root, 'package.json'));
      if (!pkg) return false;
      const deps = pkg.dependencies as Record<string, string> | undefined;
      return !!deps?.['@supabase/supabase-js'];
    },
  },
];

// ─── Bolt Signals ───────────────────────────────────────────────────────────

const boltSignals: PlatformSignalCheck[] = [
  {
    platform: 'bolt',
    type: 'directory structure',
    detail: '.bolt/ directory found',
    weight: 3,
    check: async (_root, files) => {
      return files.some((f) => f.startsWith('.bolt/') || f.startsWith('.bolt\\'));
    },
  },
  {
    platform: 'bolt',
    type: 'config file',
    detail: 'bolt.config.js or bolt.config.ts found',
    weight: 3,
    check: async (_root, files) => {
      return files.some(
        (f) =>
          f === 'bolt.config.js' ||
          f === 'bolt.config.ts' ||
          f === 'bolt.config.json'
      );
    },
  },
  {
    platform: 'bolt',
    type: 'content marker',
    detail: 'WebContainer or Bolt-specific references in source',
    weight: 2,
    check: async (root, files) => {
      const jsFiles = files.filter(
        (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
      );
      const sample = jsFiles.slice(0, 20);
      for (const f of sample) {
        const content = await safeReadFile(join(root, f));
        if (content && /webcontainer|bolt\.new/i.test(content)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    platform: 'bolt',
    type: 'package.json marker',
    detail: 'Bolt or StackBlitz-specific packages found',
    weight: 2,
    check: async (root) => {
      const pkg = await safeParseJson(join(root, 'package.json'));
      if (!pkg) return false;
      const allDeps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      return Object.keys(allDeps).some(
        (dep) => dep.startsWith('@bolt') || dep.startsWith('@stackblitz/') || dep.includes('bolt-')
      );
    },
  },
];

// ─── Replit Signals ─────────────────────────────────────────────────────────

const replitSignals: PlatformSignalCheck[] = [
  {
    platform: 'replit',
    type: 'config file',
    detail: '.replit configuration file found',
    weight: 3,
    check: async (_root, files) => {
      return files.some((f) => f === '.replit');
    },
  },
  {
    platform: 'replit',
    type: 'nix configuration',
    detail: 'replit.nix found',
    weight: 3,
    check: async (_root, files) => {
      return files.some((f) => f === 'replit.nix');
    },
  },
  {
    platform: 'replit',
    type: 'database reference',
    detail: 'Replit Database (REPLIT_DB_URL) usage found',
    weight: 2,
    check: async (root, files) => {
      const jsFiles = files.filter(
        (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
      );
      const sample = jsFiles.slice(0, 20);
      for (const f of sample) {
        const content = await safeReadFile(join(root, f));
        if (content && /REPLIT_DB_URL|@replit\/database/i.test(content)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    platform: 'replit',
    type: 'package.json marker',
    detail: 'Replit-specific packages found',
    weight: 2,
    check: async (root) => {
      const pkg = await safeParseJson(join(root, 'package.json'));
      if (!pkg) return false;
      const allDeps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      return Object.keys(allDeps).some(
        (dep) => dep.startsWith('@replit/') || dep === 'replit'
      );
    },
  },
];

// ─── Detection Engine ───────────────────────────────────────────────────────

/**
 * Compute confidence from total signal weight.
 *
 * Weight thresholds are calibrated as:
 * - high (≥5): Multiple strong signals or one strong + several weak
 * - medium (≥3): One strong signal or several weak ones
 * - low (<3): Only weak signals found
 */
function weightToConfidence(totalWeight: number): Confidence {
  if (totalWeight >= 5) return 'high';
  if (totalWeight >= 3) return 'medium';
  return 'low';
}

/**
 * Detect which platform a project was exported from.
 *
 * Uses multiple signals per platform and returns a confidence level.
 * When confidence is not 'high', the CLI should suggest --platform override.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param files - All file paths in the project (relative to root).
 * @returns Detection result with platform, confidence, and signals.
 */
export async function detectPlatform(
  projectRoot: string,
  files: string[]
): Promise<PlatformDetection> {
  const allChecks = [...lovableSignals, ...boltSignals, ...replitSignals];

  // Run all checks in parallel for speed
  const results = await Promise.all(
    allChecks.map(async (check) => ({
      check,
      matched: await check.check(projectRoot, files).catch(() => false),
    }))
  );

  // Group matched signals by platform
  const platformScores = new Map<Platform, { weight: number; signals: DetectionSignal[] }>();

  for (const { check, matched } of results) {
    if (!matched) continue;

    const current = platformScores.get(check.platform) ?? { weight: 0, signals: [] };
    current.weight += check.weight;
    current.signals.push({
      type: check.type,
      detail: check.detail,
      weight: check.weight,
    });
    platformScores.set(check.platform, current);
  }

  // Find the platform with the highest total weight
  let bestPlatform: Platform = 'unknown';
  let bestWeight = 0;
  let bestSignals: DetectionSignal[] = [];

  for (const [platform, data] of platformScores) {
    if (data.weight > bestWeight) {
      bestPlatform = platform;
      bestWeight = data.weight;
      bestSignals = data.signals;
    }
  }

  if (bestPlatform === 'unknown') {
    return {
      platform: 'unknown',
      confidence: 'low',
      signals: [],
    };
  }

  return {
    platform: bestPlatform,
    confidence: weightToConfidence(bestWeight),
    signals: bestSignals,
  };
}
