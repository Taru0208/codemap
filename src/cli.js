#!/usr/bin/env node

import { resolve } from 'path';
import { analyzeDirectory } from './analyzer.js';
import { formatTree, formatSummary, formatMarkdown, formatGraph } from './formatter.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-')));
const positional = args.filter(a => !a.startsWith('-'));

if (flags.has('--help') || flags.has('-h')) {
  console.log(`codemap — structural overview of your codebase

Usage: codemap [directory] [options]

Options:
  -s, --summary     Show summary statistics only
  -m, --markdown    Output as Markdown
  -j, --json        Output as JSON
  -g, --graph       Output dependency graph as Mermaid
  -d, --max-depth N Maximum directory depth (default: unlimited)
  -i, --ignore      Additional ignore patterns (comma-separated)
  --no-gitignore    Don't read .gitignore
  -h, --help        Show this help

Examples:
  codemap                    Analyze current directory
  codemap ./src              Analyze src directory
  codemap -m > CODEMAP.md    Export as Markdown
  codemap -j | jq .languages Pipe JSON to other tools
  codemap -s                 Quick summary`);
  process.exit(0);
}

const targetDir = resolve(positional[0] || '.');
const summaryOnly = flags.has('-s') || flags.has('--summary');
const markdown = flags.has('-m') || flags.has('--markdown');
const json = flags.has('-j') || flags.has('--json');
const graph = flags.has('-g') || flags.has('--graph');
const noGitignore = flags.has('--no-gitignore');

let maxDepth = Infinity;
const depthIdx = args.findIndex(a => a === '-d' || a === '--max-depth');
if (depthIdx !== -1 && args[depthIdx + 1]) {
  maxDepth = parseInt(args[depthIdx + 1], 10);
}

let extraIgnore = [];
const ignoreIdx = args.findIndex(a => a === '-i' || a === '--ignore');
if (ignoreIdx !== -1 && args[ignoreIdx + 1]) {
  extraIgnore = args[ignoreIdx + 1].split(',');
}

try {
  const result = await analyzeDirectory(targetDir, {
    maxDepth,
    extraIgnore,
    useGitignore: !noGitignore,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (graph) {
    console.log(formatGraph(result));
  } else if (summaryOnly) {
    console.log(formatSummary(result));
  } else if (markdown) {
    console.log(formatMarkdown(result));
  } else {
    console.log(formatTree(result));
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
