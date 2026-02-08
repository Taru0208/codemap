import { dirname, basename, join, relative } from 'path';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function languageBar(languages, width = 40) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  if (total === 0) return '';

  const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const lines = sorted.map(([lang, count]) => {
    const pct = (count / total * 100);
    const barLen = Math.max(1, Math.round(pct / 100 * width));
    const bar = '█'.repeat(barLen) + '░'.repeat(width - barLen);
    return `  ${bar} ${lang} ${pct.toFixed(1)}% (${count.toLocaleString()} lines)`;
  });

  return lines.join('\n');
}

export function formatSummary(result) {
  const lines = [];
  lines.push(`📁 ${result.root}`);
  lines.push(`   ${result.totalFiles} files, ${result.totalDirs} directories`);
  lines.push(`   ${result.totalLines.toLocaleString()} lines, ${formatBytes(result.totalSize)}`);
  lines.push('');

  if (Object.keys(result.languages).length > 0) {
    lines.push('Languages:');
    lines.push(languageBar(result.languages));
  }

  return lines.join('\n');
}

export function formatTree(result) {
  const lines = [];

  // Header
  lines.push(`\x1b[1m${basename(result.root)}/\x1b[0m`);
  lines.push('');

  // Build tree structure
  const tree = {};
  for (const file of result.files) {
    const dir = dirname(file.path);
    const key = dir === '.' ? '' : dir;
    if (!tree[key]) tree[key] = [];
    tree[key].push(file);
  }

  // Get sorted directory paths
  const dirPaths = Object.keys(tree).sort();

  for (const dirPath of dirPaths) {
    const files = tree[dirPath];

    if (dirPath) {
      lines.push(`\x1b[36m${dirPath}/\x1b[0m`);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isLast = i === files.length - 1;
      const prefix = dirPath ? (isLast ? '  └─ ' : '  ├─ ') : (isLast ? '└─ ' : '├─ ');

      let fileStr = `${prefix}${file.name}`;

      // Add file info
      const info = [];
      if (file.type) info.push(`\x1b[33m${file.type}\x1b[0m`);
      if (file.lines > 0) info.push(`${file.lines}L`);
      if (info.length > 0) fileStr += ` \x1b[2m(${info.join(', ')})\x1b[0m`;

      lines.push(fileStr);

      // Show signatures for code files (up to 5)
      if (file.signatures.length > 0) {
        const sigPrefix = dirPath ? '     ' : '   ';
        const shown = file.signatures.slice(0, 8);
        for (const sig of shown) {
          const exported = sig.exported ? '⬡ ' : '  ';
          lines.push(`\x1b[2m${sigPrefix}${exported}${sig.type} ${sig.name}:${sig.line}\x1b[0m`);
        }
        if (file.signatures.length > 8) {
          lines.push(`\x1b[2m${sigPrefix}  ... +${file.signatures.length - 8} more\x1b[0m`);
        }
      }
    }

    lines.push('');
  }

  // Summary
  lines.push('─'.repeat(50));
  lines.push(formatSummary(result));

  return lines.join('\n');
}

export function formatMarkdown(result) {
  const lines = [];

  lines.push(`# ${basename(result.root)}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Files | ${result.totalFiles} |`);
  lines.push(`| Directories | ${result.totalDirs} |`);
  lines.push(`| Lines of code | ${result.totalLines.toLocaleString()} |`);
  lines.push(`| Total size | ${formatBytes(result.totalSize)} |`);
  lines.push('');

  // Languages
  if (Object.keys(result.languages).length > 0) {
    const total = Object.values(result.languages).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(result.languages).sort((a, b) => b[1] - a[1]);

    lines.push('## Languages');
    lines.push('');
    lines.push('| Language | Lines | Percentage |');
    lines.push('| --- | ---: | ---: |');
    for (const [lang, count] of sorted) {
      lines.push(`| ${lang} | ${count.toLocaleString()} | ${(count / total * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  // File structure
  lines.push('## Structure');
  lines.push('');

  const tree = {};
  for (const file of result.files) {
    const dir = dirname(file.path);
    const key = dir === '.' ? '' : dir;
    if (!tree[key]) tree[key] = [];
    tree[key].push(file);
  }

  const dirPaths = Object.keys(tree).sort();

  for (const dirPath of dirPaths) {
    const files = tree[dirPath];

    if (dirPath) {
      lines.push(`### \`${dirPath}/\``);
    } else {
      lines.push('### Root');
    }
    lines.push('');

    for (const file of files) {
      const info = [];
      if (file.type) info.push(file.type);
      if (file.lines > 0) info.push(`${file.lines} lines`);
      const infoStr = info.length > 0 ? ` — ${info.join(', ')}` : '';

      lines.push(`- **\`${file.name}\`**${infoStr}`);

      // Show signatures
      if (file.signatures.length > 0) {
        const shown = file.signatures.slice(0, 10);
        for (const sig of shown) {
          const exported = sig.exported ? ' *(exported)*' : '';
          lines.push(`  - \`${sig.type} ${sig.name}\` (line ${sig.line})${exported}`);
        }
        if (file.signatures.length > 10) {
          lines.push(`  - *... +${file.signatures.length - 10} more*`);
        }
      }
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by [codemap](https://github.com/codemap-cli)*');

  return lines.join('\n');
}

export function formatGraph(result) {
  const lines = ['graph LR'];
  const fileSet = new Set(result.files.map(f => f.path));

  // Build a map of file paths for import resolution
  const fileByName = new Map();
  for (const f of result.files) {
    fileByName.set(f.path, f);
    fileByName.set(f.name, f);
    // Also map without extension
    const noExt = f.path.replace(/\.[^.]+$/, '');
    fileByName.set(noExt, f);
    const nameNoExt = f.name.replace(/\.[^.]+$/, '');
    fileByName.set(nameNoExt, f);
  }

  const edges = new Set();
  const nodes = new Set();

  for (const file of result.files) {
    if (!file.imports || file.imports.length === 0) continue;

    for (const imp of file.imports) {
      // Skip external packages (no ./ or ../ prefix for JS, stdlib for others)
      let resolved = null;

      if (imp.startsWith('./') || imp.startsWith('../')) {
        // Relative import — resolve against file's directory
        const dir = dirname(file.path);
        const relPath = join(dir, imp).replace(/\\/g, '/');
        // Try exact match, then with common extensions
        const candidates = [relPath, relPath + '.js', relPath + '.ts', relPath + '.jsx', relPath + '.tsx', relPath + '/index.js', relPath + '/index.ts'];
        for (const c of candidates) {
          if (fileSet.has(c)) { resolved = c; break; }
        }
      }

      if (resolved) {
        const fromId = file.path.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = resolved.replace(/[^a-zA-Z0-9]/g, '_');
        const edge = `${fromId} --> ${toId}`;
        if (!edges.has(edge)) {
          edges.add(edge);
          nodes.add(`  ${fromId}["${file.path}"]`);
          nodes.add(`  ${toId}["${resolved}"]`);
        }
      }
    }
  }

  if (edges.size === 0) {
    return '```mermaid\ngraph LR\n  no_deps["No internal dependencies found"]\n```';
  }

  for (const node of nodes) lines.push(node);
  lines.push('');
  for (const edge of edges) lines.push(`  ${edge}`);

  return '```mermaid\n' + lines.join('\n') + '\n```';
}
