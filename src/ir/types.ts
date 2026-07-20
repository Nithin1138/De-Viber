export interface ProjectIR {
  /** Map of relative file paths to their symbol table. */
  symbols: Record<string, FileSymbols>;

  /** Dependency graph: file paths importing each other. */
  dependencies: DependencyGraph;

  /** Data-layer bindings: db client, auth calls, env variables. */
  dataBindings: DataBinding[];
}

export interface FileSymbols {
  imports: ImportSymbol[];
  exports: ExportSymbol[];
  classes: ClassSymbol[];
  functions: FunctionSymbol[];
}

export interface ImportSymbol {
  name: string;      // Local alias name
  importedName?: string; // Original imported name
  source: string;    // Library/file imported from
  isDefault: boolean;
}

export interface ExportSymbol {
  name: string;
  isDefault: boolean;
}

export interface ClassSymbol {
  name: string;
  methods: { name: string; startLine: number; endLine: number }[];
  startLine: number;
  endLine: number;
}

export interface FunctionSymbol {
  name: string;
  calls: string[];   // Names of functions/methods called inside
  startLine: number;
  endLine: number;
}

export interface DependencyGraph {
  /** Map of file -> list of files it imports (outgoing edges). */
  imports: Record<string, string[]>;
  /** Map of file -> list of files that import it (incoming edges). */
  importedBy: Record<string, string[]>;
  /** Centrality scores for files, PageRank-style (0-1). */
  centrality: Record<string, number>;
}

export interface DataBinding {
  file: string;
  line: number;
  column: number;
  type: 'database' | 'auth' | 'env';
  expression: string; // e.g. "supabase.from('profiles')"
  name: string;       // e.g. "supabase" or "DB_PASS"
  origin: 'platform-native' | 'standard';
}
