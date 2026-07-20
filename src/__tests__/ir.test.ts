import { describe, it, expect } from 'vitest';
import { buildProjectIR } from '../ir/parser.js';

describe('Universal IR Parser & Centrality', () => {
  it('correctly parses symbols, data bindings, and computes PageRank', async () => {
    // We mock files in-memory to test AST parsing and graph logic
    const files = [
      'src/index.ts',
      'src/lib/db.ts',
      'src/components/Button.tsx',
      'src/api/users.ts'
    ];

    const fileContents: Record<string, string> = {
      'src/index.ts': `
        import { dbQuery } from './lib/db';
        import { Button } from './components/Button';
        console.log('App started');
        dbQuery();
      `,
      'src/lib/db.ts': `
        import { supabase } from './supabase';
        export function dbQuery() {
          return supabase.from('users').select('*').eq('id', '123');
        }
      `,
      'src/components/Button.tsx': `
        import React from 'react';
        export const Button = () => <button>Click me</button>;
      `,
      'src/api/users.ts': `
        import { dbQuery } from '../lib/db';
        const apiKey = process.env.API_KEY;
        export const getUser = (userId: string) => {
          return dbQuery();
        };
      `
    };

    const readFile = async (path: string) => fileContents[path] || null;

    const ir = await buildProjectIR('/dummy/project', files, readFile);

    // 1. Symbol Table Assertions
    expect(ir.symbols['src/index.ts']).toBeDefined();
    expect(ir.symbols['src/index.ts'].imports).toContainEqual(
      expect.objectContaining({ name: 'dbQuery', source: './lib/db' })
    );

    // 2. Data Bindings Assertions
    // src/lib/db.ts has a database call (supabase.from)
    const dbBindings = ir.dataBindings.filter(b => b.type === 'database');
    expect(dbBindings.length).toBeGreaterThanOrEqual(1);
    expect(dbBindings[0].file).toBe('src/lib/db.ts');
    expect(dbBindings[0].name).toBe('supabase');

    // src/api/users.ts has an env variable check (process.env.API_KEY)
    const envBindings = ir.dataBindings.filter(b => b.type === 'env');
    expect(envBindings.length).toBe(1);
    expect(envBindings[0].file).toBe('src/api/users.ts');
    expect(envBindings[0].name).toBe('API_KEY');

    // 3. Centrality Assertions
    // src/lib/db.ts is imported by src/index.ts and src/api/users.ts.
    // It is a highly central hub file, so its centrality should be high (closer to 1).
    expect(ir.dependencies.centrality['src/lib/db.ts']).toBe(1);
  });
});
