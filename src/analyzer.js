import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename, relative } from 'path';

const DEFAULT_IGNORE = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
  'coverage', '.nyc_output', '.next', '.nuxt', '.cache',
  'vendor', 'target', '.idea', '.vscode',
];

const LANG_MAP = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.pyw': 'Python',
  '.rb': 'Ruby', '.rs': 'Rust', '.go': 'Go',
  '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.hpp': 'C++', '.cc': 'C++',
  '.cs': 'C#', '.fs': 'F#',
  '.php': 'PHP', '.swift': 'Swift', '.m': 'Objective-C',
  '.r': 'R', '.R': 'R', '.jl': 'Julia',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.fish': 'Shell',
  '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.xml': 'XML', '.svg': 'SVG',
  '.md': 'Markdown', '.rst': 'reStructuredText', '.txt': 'Text',
  '.sql': 'SQL', '.graphql': 'GraphQL', '.gql': 'GraphQL',
  '.proto': 'Protocol Buffers',
  '.dockerfile': 'Dockerfile', '.lua': 'Lua', '.vim': 'Vim Script',
  '.el': 'Emacs Lisp', '.clj': 'Clojure', '.ex': 'Elixir', '.erl': 'Erlang',
  '.zig': 'Zig', '.nim': 'Nim', '.d': 'D', '.dart': 'Dart',
  '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro',
};

const CODE_EXTENSIONS = new Set(Object.keys(LANG_MAP).filter(
  ext => ![ '.json', '.yaml', '.yml', '.toml', '.xml', '.svg', '.md', '.rst', '.txt' ].includes(ext)
));

function parseGitignore(content) {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/\/$/, ''));
}

function shouldIgnore(name, ignorePatterns) {
  return ignorePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(name);
    }
    return name === pattern;
  });
}

function detectFileType(name, ext) {
  const lower = name.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'Dockerfile';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'Makefile';
  if (lower === '.gitignore' || lower === '.dockerignore') return 'Ignore file';
  if (lower === '.env' || lower.startsWith('.env.')) return 'Environment config';
  if (lower === 'license' || lower === 'licence') return 'License';
  return LANG_MAP[ext] || null;
}

function extractSignatures(content, ext) {
  const signatures = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // JavaScript/TypeScript
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
      // Exported functions/classes/consts
      const exportMatch = line.match(/^export\s+(default\s+)?(function|class|const|let|var|interface|type|enum)\s+(\w+)/);
      if (exportMatch) {
        signatures.push({ type: exportMatch[2], name: exportMatch[3], line: i + 1, exported: true });
        continue;
      }
      // Top-level function/class
      const funcMatch = line.match(/^(async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        signatures.push({ type: 'function', name: funcMatch[2], line: i + 1 });
        continue;
      }
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        signatures.push({ type: 'class', name: classMatch[1], line: i + 1 });
        continue;
      }
    }

    // Python
    if (['.py', '.pyw'].includes(ext)) {
      const defMatch = line.match(/^(async\s+)?def\s+(\w+)/);
      if (defMatch) {
        signatures.push({ type: 'function', name: defMatch[2], line: i + 1 });
        continue;
      }
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        signatures.push({ type: 'class', name: classMatch[1], line: i + 1 });
        continue;
      }
    }

    // Go
    if (ext === '.go') {
      const funcMatch = line.match(/^func\s+(?:\(.*?\)\s+)?(\w+)/);
      if (funcMatch) {
        signatures.push({ type: 'function', name: funcMatch[1], line: i + 1 });
        continue;
      }
      const typeMatch = line.match(/^type\s+(\w+)\s+(struct|interface)/);
      if (typeMatch) {
        signatures.push({ type: typeMatch[2], name: typeMatch[1], line: i + 1 });
        continue;
      }
    }

    // Rust
    if (ext === '.rs') {
      const fnMatch = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
      if (fnMatch) {
        signatures.push({ type: 'function', name: fnMatch[1], line: i + 1 });
        continue;
      }
      const structMatch = line.match(/^(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/);
      if (structMatch) {
        signatures.push({ type: 'struct', name: structMatch[1], line: i + 1 });
        continue;
      }
    }

    // C/C++
    if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) {
      const funcMatch = line.match(/^(?:static\s+|inline\s+|extern\s+)*(?:[\w:*&<>]+\s+)+(\w+)\s*\(/);
      if (funcMatch && !['if', 'while', 'for', 'switch', 'return'].includes(funcMatch[1])) {
        signatures.push({ type: 'function', name: funcMatch[1], line: i + 1 });
        continue;
      }
      const classMatch = line.match(/^(?:class|struct)\s+(\w+)/);
      if (classMatch) {
        signatures.push({ type: 'class', name: classMatch[1], line: i + 1 });
        continue;
      }
    }

    // Java/Kotlin
    if (['.java', '.kt'].includes(ext)) {
      const classMatch = line.match(/^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:data\s+)?(?:class|interface|enum|object)\s+(\w+)/);
      if (classMatch) {
        signatures.push({ type: 'class', name: classMatch[1], line: i + 1 });
        continue;
      }
    }

    // Ruby
    if (ext === '.rb') {
      const defMatch = line.match(/^\s*def\s+(self\.)?(\w+[?!=]?)/);
      if (defMatch && !line.match(/^\s{2,}/)) {
        signatures.push({ type: 'method', name: defMatch[2], line: i + 1 });
        continue;
      }
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        signatures.push({ type: 'class', name: classMatch[1], line: i + 1 });
        continue;
      }
    }

    // Shell
    if (['.sh', '.bash', '.zsh'].includes(ext)) {
      const funcMatch = line.match(/^(?:function\s+)?(\w+)\s*\(\)/);
      if (funcMatch) {
        signatures.push({ type: 'function', name: funcMatch[1], line: i + 1 });
      }
    }
  }

  return signatures;
}

function extractImports(content, ext) {
  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // JavaScript/TypeScript
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
      const importMatch = line.match(/(?:import\s+.*\s+from\s+|import\s+)['"]([^'"]+)['"]/);
      if (importMatch) { imports.push(importMatch[1]); continue; }
      const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) { imports.push(requireMatch[1]); continue; }
    }

    // Python
    if (['.py', '.pyw'].includes(ext)) {
      const fromMatch = line.match(/^from\s+([\w.]+)\s+import/);
      if (fromMatch) { imports.push(fromMatch[1]); continue; }
      const importMatch = line.match(/^import\s+([\w.]+)/);
      if (importMatch) { imports.push(importMatch[1]); continue; }
    }

    // Go
    if (ext === '.go') {
      const importMatch = line.match(/^\s*"([^"]+)"/);
      if (importMatch) { imports.push(importMatch[1]); continue; }
    }

    // Rust
    if (ext === '.rs') {
      const useMatch = line.match(/^use\s+([\w:]+)/);
      if (useMatch) { imports.push(useMatch[1]); continue; }
    }

    // C/C++
    if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) {
      const includeMatch = line.match(/^#include\s+["<]([^">]+)[">]/);
      if (includeMatch) { imports.push(includeMatch[1]); continue; }
    }
  }

  return imports;
}

async function analyzeFile(filePath, rootDir) {
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const fileType = detectFileType(name, ext);
  const fileStat = await stat(filePath);
  const relPath = relative(rootDir, filePath);

  const result = {
    name,
    path: relPath,
    size: fileStat.size,
    type: fileType,
    ext,
    lines: 0,
    signatures: [],
    imports: [],
    isCode: CODE_EXTENSIONS.has(ext),
  };

  // Only read files under 500KB
  if (fileStat.size < 512000) {
    try {
      const content = await readFile(filePath, 'utf-8');
      result.lines = content.split('\n').length;
      if (result.isCode) {
        result.signatures = extractSignatures(content, ext);
        result.imports = extractImports(content, ext);
      }
    } catch {
      // Binary file or encoding issue — skip content analysis
    }
  }

  return result;
}

export async function analyzeDirectory(rootDir, options = {}) {
  const { maxDepth = Infinity, extraIgnore = [], useGitignore = true } = options;

  let ignorePatterns = [...DEFAULT_IGNORE, ...extraIgnore];

  if (useGitignore) {
    try {
      const gitignoreContent = await readFile(join(rootDir, '.gitignore'), 'utf-8');
      ignorePatterns = [...ignorePatterns, ...parseGitignore(gitignoreContent)];
    } catch {
      // No .gitignore
    }
  }

  const files = [];
  const dirs = [];
  const languages = {};
  let totalLines = 0;
  let totalFiles = 0;
  let totalSize = 0;

  async function walk(dir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (shouldIgnore(entry.name, ignorePatterns)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        dirs.push(relative(rootDir, fullPath));
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const fileInfo = await analyzeFile(fullPath, rootDir);
        files.push(fileInfo);
        totalFiles++;
        totalLines += fileInfo.lines;
        totalSize += fileInfo.size;
        if (fileInfo.type && fileInfo.isCode) {
          languages[fileInfo.type] = (languages[fileInfo.type] || 0) + fileInfo.lines;
        }
      }
    }
  }

  await walk(rootDir, 0);

  return {
    root: rootDir,
    files,
    dirs,
    languages,
    totalFiles,
    totalLines,
    totalSize,
    totalDirs: dirs.length,
  };
}
