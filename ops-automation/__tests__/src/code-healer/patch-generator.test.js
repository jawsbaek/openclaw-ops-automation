import { promises as fs } from 'node:fs';
import PatchGenerator from '../../../src/code-healer/patch-generator.js';

describe('PatchGenerator', () => {
  let patchGenerator;

  beforeEach(() => {
    patchGenerator = new PatchGenerator();
  });

  describe('Constructor', () => {
    test('should initialize with default patterns when no config provided', () => {
      expect(patchGenerator.patterns).toBeDefined();
      expect(patchGenerator.patterns.length).toBeGreaterThan(0);
    });

    test('should initialize with custom patterns when provided', () => {
      const customPatterns = [{ name: 'custom', types: ['test'], keywords: ['test'] }];
      const generator = new PatchGenerator(customPatterns);
      expect(generator.patterns).toEqual(customPatterns);
    });

    test('should initialize empty generatedPatches array', () => {
      expect(patchGenerator.generatedPatches).toEqual([]);
    });
  });

  describe('getDefaultPatterns', () => {
    test('should return connection_leak pattern', () => {
      const patterns = patchGenerator.getDefaultPatterns();
      const connectionLeakPattern = patterns.find((p) => p.name === 'connection_leak');

      expect(connectionLeakPattern).toBeDefined();
      expect(connectionLeakPattern.types).toContain('connection_leak');
      expect(connectionLeakPattern.types).toContain('resource_leak');
    });

    test('should return missing_error_handling pattern', () => {
      const patterns = patchGenerator.getDefaultPatterns();
      const errorPattern = patterns.find((p) => p.name === 'missing_error_handling');

      expect(errorPattern).toBeDefined();
      expect(errorPattern.types).toContain('unhandled_error');
      expect(errorPattern.fix.type).toBe('add_error_handling');
    });

    test('should return missing_timeout pattern', () => {
      const patterns = patchGenerator.getDefaultPatterns();
      const timeoutPattern = patterns.find((p) => p.name === 'missing_timeout');

      expect(timeoutPattern).toBeDefined();
      expect(timeoutPattern.types).toContain('timeout');
      expect(timeoutPattern.fix.timeoutMs).toBe(30000);
    });
  });

  describe('findMatchingPattern', () => {
    test('should find pattern matching issue type and evidence', () => {
      const pattern = patchGenerator.findMatchingPattern('connection_leak', ['connection close needed']);

      expect(pattern).toBeDefined();
      expect(pattern.name).toBe('connection_leak');
    });

    test('should return null when no pattern matches', () => {
      const pattern = patchGenerator.findMatchingPattern('unknown_type', ['no matching keywords']);

      expect(pattern).toBeNull();
    });

    test('should match based on keywords in evidence', () => {
      const pattern = patchGenerator.findMatchingPattern('timeout', ['fetch request needs timeout']);

      expect(pattern).toBeDefined();
      expect(pattern.name).toBe('missing_timeout');
    });
  });

  describe('calculateConfidence', () => {
    test('should calculate higher confidence with more keyword matches', () => {
      const pattern = patchGenerator.getDefaultPatterns()[0];
      const lowEvidence = ['close'];
      const highEvidence = ['close', 'release', 'connection', 'finally'];

      const lowConfidence = patchGenerator.calculateConfidence(pattern, lowEvidence);
      const highConfidence = patchGenerator.calculateConfidence(pattern, highEvidence);

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });

    test('should cap confidence at 0.95', () => {
      const pattern = patchGenerator.getDefaultPatterns()[0];
      const manyKeywords = ['close', 'release', 'connection', 'finally', 'close', 'release', 'connection'];

      const confidence = patchGenerator.calculateConfidence(pattern, manyKeywords);

      expect(confidence).toBeLessThanOrEqual(0.95);
    });

    test('should return minimum confidence of 0.5', () => {
      const pattern = patchGenerator.getDefaultPatterns()[0];

      const confidence = patchGenerator.calculateConfidence(pattern, []);

      expect(confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('generatePatchId', () => {
    test('should generate unique patch IDs', () => {
      const id1 = patchGenerator.generatePatchId();
      const id2 = patchGenerator.generatePatchId();

      expect(id1).not.toBe(id2);
    });

    test('should generate ID with correct prefix', () => {
      const id = patchGenerator.generatePatchId();

      expect(id.startsWith('patch-')).toBe(true);
    });
  });

  describe('getIndent', () => {
    test('should extract leading spaces', () => {
      expect(patchGenerator.getIndent('    const x = 1;')).toBe('    ');
    });

    test('should extract leading tabs', () => {
      expect(patchGenerator.getIndent('\t\tconst x = 1;')).toBe('\t\t');
    });

    test('should return empty string for no indent', () => {
      expect(patchGenerator.getIndent('const x = 1;')).toBe('');
    });

    test('should handle mixed whitespace', () => {
      expect(patchGenerator.getIndent('  \t const x = 1;')).toBe('  \t ');
    });
  });

  describe('getContext', () => {
    test('should get surrounding lines', () => {
      const lines = ['line1', 'line2', 'line3', 'line4', 'line5'];
      const context = patchGenerator.getContext(lines, 2, 1);

      expect(context).toEqual(['line2', 'line3', 'line4']);
    });

    test('should handle edge case at beginning', () => {
      const lines = ['line1', 'line2', 'line3'];
      const context = patchGenerator.getContext(lines, 0, 2);

      expect(context).toEqual(['line1', 'line2', 'line3']);
    });

    test('should handle edge case at end', () => {
      const lines = ['line1', 'line2', 'line3'];
      const context = patchGenerator.getContext(lines, 2, 2);

      expect(context).toEqual(['line1', 'line2', 'line3']);
    });
  });

  describe('validateContext', () => {
    test('should return true when no requirements', () => {
      expect(patchGenerator.validateContext(['any', 'lines'], null)).toBe(true);
      expect(patchGenerator.validateContext(['any', 'lines'], undefined)).toBe(true);
    });

    test('should return true when all requirements met', () => {
      const context = ['const connection = await getConnection();', 'await connection.query();'];
      const requirements = ['await', 'const'];

      expect(patchGenerator.validateContext(context, requirements)).toBe(true);
    });

    test('should return false when requirements not met', () => {
      const context = ['const x = 1;', 'console.log(x);'];
      const requirements = ['await', 'async'];

      expect(patchGenerator.validateContext(context, requirements)).toBe(false);
    });
  });

  describe('findBlockStart', () => {
    test('should find function start', () => {
      const lines = ['function test() {', '  const x = 1;', '  return x;', '}'];
      const start = patchGenerator.findBlockStart(lines, 1);

      expect(start).toBe(1);
    });

    test('should find async function start', () => {
      const lines = ['async function test() {', '  const x = await fetch();', '  return x;', '}'];
      const start = patchGenerator.findBlockStart(lines, 1);

      expect(start).toBe(1);
    });

    test('should return current line when no function found', () => {
      const lines = ['const x = 1;', 'const y = 2;'];
      const start = patchGenerator.findBlockStart(lines, 1);

      expect(start).toBe(1);
    });
  });

  describe('findBlockEnd', () => {
    test('should find return statement', () => {
      const lines = ['function test() {', '  const x = 1;', '  return x;', '}'];
      const end = patchGenerator.findBlockEnd(lines, 1);

      expect(end).toBe(2);
    });

    test('should find closing brace', () => {
      const lines = ['if (x) {', '  doSomething();', '}'];
      const end = patchGenerator.findBlockEnd(lines, 1);

      expect(end).toBe(2);
    });

    test('should return current line when no end found', () => {
      const lines = ['const x = 1;', 'const y = 2;'];
      const end = patchGenerator.findBlockEnd(lines, 0);

      expect(end).toBe(0);
    });
  });

  describe('addTimeout', () => {
    test('should add timeout to fetch call', () => {
      const lines = ['const response = await fetch(url);'];
      const fix = { timeoutMs: 5000 };

      const result = patchGenerator.addTimeout(lines, 1, fix);

      expect(result.modified).toContain('AbortSignal.timeout(5000)');
    });

    test('should add timeout to axios call', () => {
      const lines = ['const response = await axios.get(url);'];
      const fix = { timeoutMs: 10000 };

      const result = patchGenerator.addTimeout(lines, 1, fix);

      expect(result.modified).toContain('timeout: 10000');
    });

    test('should not modify line without fetch or axios', () => {
      const lines = ['const data = getData();'];
      const fix = { timeoutMs: 5000 };

      const result = patchGenerator.addTimeout(lines, 1, fix);

      expect(result.modified).toBe(lines[0]);
    });
  });

  describe('applyChanges', () => {
    test('should apply replace change', () => {
      const lines = ['line1', 'line2', 'line3'];
      const changes = [{ type: 'replace', lineNumber: 2, modified: 'newLine2' }];

      const result = patchGenerator.applyChanges(lines, changes);

      expect(result).toBe('line1\nnewLine2\nline3');
    });

    test('should apply insert change', () => {
      const lines = ['line1', 'line2', 'line3'];
      const changes = [{ type: 'insert', lineNumber: 2, modified: 'inserted' }];

      const result = patchGenerator.applyChanges(lines, changes);

      expect(result).toBe('line1\nline2\ninserted\nline3');
    });

    test('should apply multiple changes in reverse order', () => {
      const lines = ['line1', 'line2', 'line3'];
      const changes = [
        { type: 'replace', lineNumber: 1, modified: 'new1' },
        { type: 'replace', lineNumber: 3, modified: 'new3' }
      ];

      const result = patchGenerator.applyChanges(lines, changes);

      expect(result).toBe('new1\nline2\nnew3');
    });
  });

  describe('getStatus', () => {
    test('should return current status', () => {
      const status = patchGenerator.getStatus();

      expect(status).toHaveProperty('generatedPatches');
      expect(status).toHaveProperty('patterns');
      expect(status.generatedPatches).toBe(0);
      expect(status.patterns).toBeGreaterThan(0);
    });

    test('should track generated patches count', () => {
      patchGenerator.generatedPatches.push({ id: 'test-1' });
      patchGenerator.generatedPatches.push({ id: 'test-2' });

      const status = patchGenerator.getStatus();

      expect(status.generatedPatches).toBe(2);
    });
  });

  describe('findIssueLocations', () => {
    test('should find locations matching pattern detectors', () => {
      const lines = ['const conn = getConnection();', 'await conn.query();', 'conn.close();'];
      const pattern = {
        detectors: [{ pattern: 'getConnection', context: ['const'] }]
      };

      const locations = patchGenerator.findIssueLocations(lines, pattern, []);

      expect(locations.length).toBe(1);
      expect(locations[0].lineNumber).toBe(1);
    });

    test('should return empty array when no matches', () => {
      const lines = ['const x = 1;', 'console.log(x);'];
      const pattern = {
        detectors: [{ pattern: 'getConnection', context: [] }]
      };

      const locations = patchGenerator.findIssueLocations(lines, pattern, []);

      expect(locations).toEqual([]);
    });

    test('should validate context requirements', () => {
      const lines = ['function test() {', 'const conn = getConnection();', '}'];
      const pattern = {
        detectors: [{ pattern: 'getConnection', context: ['const', 'function'] }]
      };

      const locations = patchGenerator.findIssueLocations(lines, pattern, []);

      expect(locations.length).toBe(1);
    });
  });

  describe('applyPattern', () => {
    test('should apply wrap_try_finally fix type', () => {
      const lines = ['function test() {', '  const conn = getConnection();', '  return conn;', '}'];
      const location = { lineNumber: 2, line: lines[1], detector: {}, context: lines };
      const pattern = { fix: { type: 'wrap_try_finally', cleanup: 'conn.close();' } };

      const result = patchGenerator.applyPattern(lines, location, pattern);

      expect(result.type).toBe('wrap');
      expect(result.modified).toContain('try {');
      expect(result.modified).toContain('finally');
    });

    test('should apply add_error_handling fix type', () => {
      const lines = ['function test() {', '  await riskyOp();', '  return result;', '}'];
      const location = { lineNumber: 2, line: lines[1], detector: {}, context: lines };
      const pattern = { fix: { type: 'add_error_handling', errorHandler: 'log(error);' } };

      const result = patchGenerator.applyPattern(lines, location, pattern);

      expect(result.type).toBe('wrap');
      expect(result.modified).toContain('catch (error)');
    });

    test('should apply add_cleanup fix type', () => {
      const lines = ['const resource = acquire();', 'use(resource);'];
      const location = { lineNumber: 1, line: lines[0], detector: {}, context: lines };
      const pattern = { fix: { type: 'add_cleanup', cleanup: 'release();' } };

      const result = patchGenerator.applyPattern(lines, location, pattern);

      expect(result.type).toBe('insert');
    });

    test('should apply add_timeout fix type', () => {
      const lines = ['const res = await fetch(url);'];
      const location = { lineNumber: 1, line: lines[0], detector: {}, context: lines };
      const pattern = { fix: { type: 'add_timeout', timeoutMs: 5000 } };

      const result = patchGenerator.applyPattern(lines, location, pattern);

      expect(result.type).toBe('replace');
    });

    test('should throw for unknown fix type', () => {
      const lines = ['const x = 1;'];
      const location = { lineNumber: 1, line: lines[0], detector: {}, context: lines };
      const pattern = { fix: { type: 'unknown_fix_type' } };

      expect(() => patchGenerator.applyPattern(lines, location, pattern)).toThrow('알 수 없는 패치 타입');
    });
  });

  describe('wrapTryFinally', () => {
    test('should create wrap change with try-finally', () => {
      const lines = ['function test() {', '  const conn = getConnection();', '  return conn;', '}'];
      const fix = { cleanup: 'conn.close();' };

      const result = patchGenerator.wrapTryFinally(lines, 2, fix);

      expect(result.type).toBe('wrap');
      expect(result.modified).toContain('try {');
      expect(result.modified).toContain('} finally {');
      expect(result.modified).toContain('conn.close();');
    });
  });

  describe('addErrorHandling', () => {
    test('should create wrap change with try-catch', () => {
      const lines = ['function test() {', '  await riskyOperation();', '  return result;', '}'];
      const fix = { errorHandler: 'logger.error("Failed", error);' };

      const result = patchGenerator.addErrorHandling(lines, 2, fix);

      expect(result.type).toBe('wrap');
      expect(result.modified).toContain('try {');
      expect(result.modified).toContain('} catch (error) {');
      expect(result.modified).toContain('logger.error("Failed", error);');
      expect(result.modified).toContain('throw error;');
    });
  });

  describe('addCleanup', () => {
    test('should create insert change for cleanup code', () => {
      const lines = ['function test() {', '  const resource = acquire();', '}'];
      const fix = { cleanup: 'resource.release();' };

      const result = patchGenerator.addCleanup(lines, 2, fix);

      expect(result.type).toBe('insert');
      expect(result.modified).toContain('resource.release();');
    });
  });
});
