import Parser from 'web-tree-sitter';
import { join, dirname, normalize, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProjectIR, FileSymbols, DataBinding, ImportSymbol, ExportSymbol, ClassSymbol, FunctionSymbol } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let initPromise: Promise<void> | null = null;
function initTreeSitter(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init();
  }
  return initPromise;
}

// Find local grammar WASM files in node_modules
function findWasmPath(language: string): string {
  let current = __dirname;
  while (true) {
    const candidate = join(current, 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${language}.wasm`);
    if (existsSync(candidate)) return candidate;
    
    const globalCandidate = join(current, '..', 'tree-sitter-wasms', 'out', `tree-sitter-${language}.wasm`);
    if (existsSync(globalCandidate)) return globalCandidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not find tree-sitter-${language}.wasm`);
}

// Helper to resolve imports (including @/ alias and extension resolution)
function resolveImport(fromFile: string, importSource: string, projectFiles: Set<string>): string | null {
  let resolvedPath = '';

  if (importSource.startsWith('@/')) {
    resolvedPath = 'src/' + importSource.slice(2);
  } else if (importSource.startsWith('.') || importSource.startsWith('..')) {
    resolvedPath = normalize(join(dirname(fromFile), importSource));
  } else {
    // Third-party import
    return null;
  }

  // Normalize Windows paths
  resolvedPath = resolvedPath.replace(/\\/g, '/');

  const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  
  if (projectFiles.has(resolvedPath)) {
    return resolvedPath;
  }

  for (const ext of extensions) {
    const candidate = resolvedPath + ext;
    if (projectFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

// Parse a single file
async function parseFile(
  file: string,
  content: string,
  parser: Parser,
  projectFiles: Set<string>
): Promise<{ symbols: FileSymbols; bindings: DataBinding[]; resolvedImports: string[] }> {
  const symbols: FileSymbols = {
    imports: [],
    exports: [],
    classes: [],
    functions: [],
  };
  const bindings: DataBinding[] = [];
  const resolvedImports: string[] = [];

  const tree = parser.parse(content);

  function traverse(node: Parser.SyntaxNode) {
    // 1. Imports
    if (node.type === 'import_statement') {
      const sourceNode = node.childForFieldName('source');
      const source = sourceNode ? sourceNode.text.slice(1, -1) : '';
      
      const importClause = node.namedChild(0);
      if (importClause && importClause.type === 'import_clause') {
        // Default import: import X from 'source'
        const defaultId = importClause.childForFieldName('name') || importClause.namedChild(0);
        if (defaultId && defaultId.type === 'identifier') {
          symbols.imports.push({
            name: defaultId.text,
            isDefault: true,
            source,
          });
        }

        // Named imports: import { X, Y as Z } from 'source'
        const namedImports = importClause.namedChildren.find((c: Parser.SyntaxNode) => c.type === 'named_imports');
        if (namedImports) {
          for (let i = 0; i < namedImports.namedChildCount; i++) {
            const specifier = namedImports.namedChild(i)!;
            if (specifier.type === 'import_specifier') {
              const nameId = specifier.childForFieldName('name');
              const valueId = specifier.childForFieldName('value') || nameId;
              if (valueId) {
                symbols.imports.push({
                  name: valueId.text,
                  importedName: nameId?.text,
                  isDefault: false,
                  source,
                });
              }
            }
          }
        }

        // Namespace import: import * as X from 'source'
        const namespace = importClause.namedChildren.find((c: Parser.SyntaxNode) => c.type === 'namespace_import');
        if (namespace) {
          const nsId = namespace.namedChild(0);
          if (nsId && nsId.type === 'identifier') {
            symbols.imports.push({
              name: nsId.text,
              isDefault: false,
              source,
            });
          }
        }
      }

      if (source) {
        const resolved = resolveImport(file, source, projectFiles);
        if (resolved) resolvedImports.push(resolved);
      }
    }

    // CommonJS require
    if (node.type === 'variable_declarator') {
      const valueNode = node.childForFieldName('value');
      if (valueNode && valueNode.type === 'call_expression') {
        const functionNode = valueNode.childForFieldName('function');
        if (functionNode && functionNode.text === 'require') {
          const argNode = valueNode.namedChild(1) || valueNode.childForFieldName('arguments')?.namedChild(0);
          if (argNode && argNode.type === 'string') {
            const source = argNode.text.slice(1, -1);
            const nameNode = node.childForFieldName('name');
            if (nameNode && nameNode.type === 'identifier') {
              symbols.imports.push({
                name: nameNode.text,
                isDefault: true,
                source,
              });
            }
            const resolved = resolveImport(file, source, projectFiles);
            if (resolved) resolvedImports.push(resolved);
          }
        }
      }
    }

    // 2. Exports
    if (node.type === 'export_statement') {
      const isDefault = node.text.includes('default');
      const declaration = node.namedChildren.find((c: Parser.SyntaxNode) => c.type.endsWith('_declaration') || c.type === 'variable_declarator');
      if (declaration) {
        const nameId = declaration.childForFieldName('name');
        if (nameId) {
          symbols.exports.push({ name: nameId.text, isDefault });
        }
      }
    }

    // 3. Classes
    if (node.type === 'class_declaration' || node.type === 'class') {
      const nameId = node.childForFieldName('name');
      if (nameId) {
        const classSymbol: ClassSymbol = {
          name: nameId.text,
          methods: [],
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        };
        
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.namedChildCount; i++) {
            const child = body.namedChild(i)!;
            if (child.type === 'method_definition') {
              const methodName = child.childForFieldName('name');
              if (methodName) {
                classSymbol.methods.push({
                  name: methodName.text,
                  startLine: child.startPosition.row + 1,
                  endLine: child.endPosition.row + 1,
                });
              }
            }
          }
        }
        symbols.classes.push(classSymbol);
      }
    }

    // 4. Functions
    if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
      const nameId = node.childForFieldName('name');
      if (nameId) {
        const fnSymbol: FunctionSymbol = {
          name: nameId.text,
          calls: [],
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        };
        // Traverse body to find function calls
        const body = node.childForFieldName('body');
        if (body) {
          traverseCalls(body, fnSymbol.calls);
        }
        symbols.functions.push(fnSymbol);
      }
    }

    // Arrow functions assigned to variables
    if (node.type === 'variable_declarator') {
      const nameId = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameId && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
        const fnSymbol: FunctionSymbol = {
          name: nameId.text,
          calls: [],
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        };
        const body = valueNode.childForFieldName('body');
        if (body) {
          traverseCalls(body, fnSymbol.calls);
        }
        symbols.functions.push(fnSymbol);
      }
    }

    // 5. Data bindings
    // Database client query calls (e.g., supabase.from('...'))
    if (node.type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      if (fnNode && fnNode.type === 'member_expression') {
        const property = fnNode.childForFieldName('property');
        if (property && property.text === 'from') {
          const object = fnNode.childForFieldName('object');
          const isSupabase = object && (object.text.toLowerCase().includes('supabase') || object.text === 'db');
          if (isSupabase) {
            // Traverse up to find the outermost call/member expression in the chain
            let outermost: Parser.SyntaxNode = node;
            while (outermost.parent && 
                   (outermost.parent.type === 'call_expression' || 
                    outermost.parent.type === 'member_expression')) {
              outermost = outermost.parent;
            }

            bindings.push({
              file,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              type: 'database',
              expression: outermost.text,
              name: object.text,
              origin: file.includes('integrations') || object.text.includes('supabase') ? 'platform-native' : 'standard',
            });
          }
        }
      }
    }

    // Auth calls (e.g. supabase.auth.signUp)
    if (node.type === 'member_expression') {
      const property = node.childForFieldName('property');
      const object = node.childForFieldName('object');
      if (property && property.text === 'auth' && object) {
        bindings.push({
          file,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          type: 'auth',
          expression: node.text,
          name: object.text,
          origin: 'platform-native',
        });
      }
    }

    // Env variables (e.g., process.env.DB_PASS, import.meta.env.VITE_DB)
    if (node.type === 'member_expression') {
      const text = node.text;
      if (text.startsWith('process.env.') || text.startsWith('import.meta.env.')) {
        const parts = text.split('.');
        const name = parts[parts.length - 1];
        bindings.push({
          file,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          type: 'env',
          expression: text,
          name,
          origin: 'standard',
        });
      }
    }

    // Recurse
    for (let i = 0; i < node.namedChildCount; i++) {
      traverse(node.namedChild(i)!);
    }
  }

  function traverseCalls(node: Parser.SyntaxNode, calls: string[]) {
    if (node.type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      if (fnNode) {
        calls.push(fnNode.text);
      }
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      traverseCalls(node.namedChild(i)!, calls);
    }
  }

  traverse(tree.rootNode);
  return { symbols, bindings, resolvedImports };
}

// Compute PageRank scores for the dependency graph
function computePageRank(
  files: string[],
  graph: Record<string, string[]>,
  importedBy: Record<string, string[]>,
  damping = 0.85,
  iterations = 20
): Record<string, number> {
  const N = files.length;
  if (N === 0) return {};

  let PR: Record<string, number> = {};
  for (const f of files) {
    PR[f] = 1 / N;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const nextPR: Record<string, number> = {};
    for (const f of files) {
      nextPR[f] = (1 - damping) / N;
    }

    // Handle sinks (nodes with no imports/outgoing edges) by distributing their rank to everyone
    let sinkPRSum = 0;
    for (const f of files) {
      const outEdges = graph[f] ?? [];
      if (outEdges.length === 0) {
        sinkPRSum += PR[f];
      }
    }

    const sinkShare = (damping * sinkPRSum) / N;
    for (const f of files) {
      nextPR[f] += sinkShare;
    }

    // Distribute rank from each node to its outgoing edges
    for (const f of files) {
      const outEdges = graph[f] ?? [];
      if (outEdges.length > 0) {
        const share = (damping * PR[f]) / outEdges.length;
        for (const target of outEdges) {
          if (target in nextPR) {
            nextPR[target] += share;
          }
        }
      }
    }

    PR = nextPR;
  }

  // Normalize scores to be in range [0, 1] relative to the max PageRank value
  let maxVal = 0;
  for (const f of files) {
    if (PR[f] > maxVal) maxVal = PR[f];
  }

  const normalized: Record<string, number> = {};
  for (const f of files) {
    normalized[f] = maxVal > 0 ? PR[f] / maxVal : 0;
  }

  return normalized;
}

/**
 * Builds the Universal IR for a given project by parsing all files.
 */
export async function buildProjectIR(
  projectRoot: string,
  files: string[],
  readFile: (relativePath: string) => Promise<string | null>
): Promise<ProjectIR> {
  await initTreeSitter();
  const ParserClass = Parser;
  const LanguageClass = Parser.Language;

  // Load language WASMs
  const jsWasm = findWasmPath('javascript');
  const tsWasm = findWasmPath('typescript');
  const tsxWasm = findWasmPath('tsx');

  const jsLang = await LanguageClass.load(jsWasm);
  const tsLang = await LanguageClass.load(tsWasm);
  const tsxLang = await LanguageClass.load(tsxWasm);

  const jsParser = new ParserClass();
  jsParser.setLanguage(jsLang);

  const tsParser = new ParserClass();
  tsParser.setLanguage(tsLang);

  const tsxParser = new ParserClass();
  tsxParser.setLanguage(tsxLang);

  const ir: ProjectIR = {
    symbols: {},
    dependencies: {
      imports: {},
      importedBy: {},
      centrality: {},
    },
    dataBindings: [],
  };

  const projectFilesSet = new Set(files.map(f => f.replace(/\\/g, '/')));
  const targetFiles = files.filter(
    (f) =>
      (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
      !f.includes('node_modules') &&
      !f.includes('.git')
  );

  // Initialize graph
  for (const file of targetFiles) {
    const normFile = file.replace(/\\/g, '/');
    ir.dependencies.imports[normFile] = [];
    ir.dependencies.importedBy[normFile] = [];
  }

  for (const file of targetFiles) {
    const normFile = file.replace(/\\/g, '/');
    const content = await readFile(file);
    if (!content) continue;

    let parser = jsParser;
    if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      parser = tsxParser;
    } else if (file.endsWith('.ts')) {
      parser = tsParser;
    }

    try {
      const result = await parseFile(normFile, content, parser, projectFilesSet);
      ir.symbols[normFile] = result.symbols;
      ir.dataBindings.push(...result.bindings);

      for (const imp of result.resolvedImports) {
        if (!ir.dependencies.imports[normFile].includes(imp)) {
          ir.dependencies.imports[normFile].push(imp);
        }
        if (!ir.dependencies.importedBy[imp]) {
          ir.dependencies.importedBy[imp] = [];
        }
        if (!ir.dependencies.importedBy[imp].includes(normFile)) {
          ir.dependencies.importedBy[imp].push(normFile);
        }
      }
    } catch (e: any) {
      console.warn(`Failed to parse ${file}: ${e.message}`);
    }
  }

  // Compute PageRank centrality
  const normalizedPR = computePageRank(
    targetFiles.map(f => f.replace(/\\/g, '/')),
    ir.dependencies.imports,
    ir.dependencies.importedBy
  );
  ir.dependencies.centrality = normalizedPR;

  return ir;
}
