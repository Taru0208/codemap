import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeDirectory } from './analyzer.js';
import { formatTree, formatSummary, formatMarkdown, formatGraph } from './formatter.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

describe('analyzeDirectory', () => {
  it('should analyze the project itself', async () => {
    const result = await analyzeDirectory(projectRoot);
    assert.ok(result.totalFiles >= 4, 'should find at least 4 files');
    assert.ok(result.totalLines > 0, 'should count lines');
    assert.ok(result.totalSize > 0, 'should sum sizes');
    assert.ok('JavaScript' in result.languages, 'should detect JavaScript');
  });

  it('should respect maxDepth', async () => {
    const shallow = await analyzeDirectory(projectRoot, { maxDepth: 0 });
    const deep = await analyzeDirectory(projectRoot, { maxDepth: 10 });
    assert.ok(deep.totalFiles >= shallow.totalFiles, 'deeper should find more or equal files');
  });

  it('should detect function signatures', async () => {
    const result = await analyzeDirectory(projectRoot);
    const analyzer = result.files.find(f => f.name === 'analyzer.js');
    assert.ok(analyzer, 'should find analyzer.js');
    assert.ok(analyzer.signatures.length > 0, 'should extract signatures');
    const names = analyzer.signatures.map(s => s.name);
    assert.ok(names.includes('extractSignatures'), 'should find extractSignatures function');
  });

  it('should extract imports from files', async () => {
    const result = await analyzeDirectory(projectRoot);
    const cli = result.files.find(f => f.name === 'cli.js');
    assert.ok(cli, 'should find cli.js');
    assert.ok(cli.imports.length > 0, 'should extract imports');
    assert.ok(cli.imports.some(i => i.includes('analyzer')), 'should find analyzer import');
    assert.ok(cli.imports.some(i => i.includes('formatter')), 'should find formatter import');
  });
});

describe('formatters', () => {
  it('should format tree without errors', async () => {
    const result = await analyzeDirectory(projectRoot);
    const output = formatTree(result);
    assert.ok(output.length > 0, 'should produce output');
    assert.ok(output.includes('codemap'), 'should contain project name');
  });

  it('should format summary without errors', async () => {
    const result = await analyzeDirectory(projectRoot);
    const output = formatSummary(result);
    assert.ok(output.includes('files'), 'should mention files');
    assert.ok(output.includes('lines'), 'should mention lines');
  });

  it('should format markdown without errors', async () => {
    const result = await analyzeDirectory(projectRoot);
    const output = formatMarkdown(result);
    assert.ok(output.startsWith('# codemap'), 'should start with heading');
    assert.ok(output.includes('| Language |'), 'should have language table');
  });

  it('should format dependency graph as Mermaid', async () => {
    const result = await analyzeDirectory(projectRoot);
    const output = formatGraph(result);
    assert.ok(output.includes('```mermaid'), 'should contain mermaid block');
    assert.ok(output.includes('graph LR'), 'should use LR graph');
    assert.ok(output.includes('-->'), 'should have dependency edges');
    assert.ok(output.includes('cli'), 'should reference cli.js');
    assert.ok(output.includes('analyzer'), 'should reference analyzer.js');
  });
});
