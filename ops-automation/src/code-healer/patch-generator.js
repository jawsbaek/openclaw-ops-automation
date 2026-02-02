/**
 * Patch Generator
 * 진단 결과를 기반으로 자동 패치 생성
 */

import { promises as fs } from 'node:fs';
import logger from '../../lib/logger.js';

class PatchGenerator {
  constructor(patternsConfig) {
    this.patterns = patternsConfig || this.getDefaultPatterns();
    this.generatedPatches = [];
  }

  /**
   * 진단 결과 기반 패치 생성
   */
  async generatePatch(issue) {
    const { type, evidence, affectedFiles } = issue;

    logger.info(`패치 생성 시작: ${type} in ${affectedFiles.join(', ')}`);

    // 패턴 매칭
    const pattern = this.findMatchingPattern(type, evidence);

    if (!pattern) {
      throw new Error(`패치 패턴을 찾을 수 없음: ${type}`);
    }

    // 파일별 패치 생성
    const patches = [];

    for (const file of affectedFiles) {
      const filePatch = await this.generateFilePatch(file, pattern, evidence);
      if (filePatch) {
        patches.push(filePatch);
      }
    }

    const patch = {
      id: this.generatePatchId(),
      type,
      pattern: pattern.name,
      files: affectedFiles,
      changes: patches,
      timestamp: new Date().toISOString(),
      confidence: this.calculateConfidence(pattern, evidence)
    };

    this.generatedPatches.push(patch);

    return patch;
  }

  /**
   * 단일 파일 패치 생성
   */
  async generateFilePatch(filePath, pattern, evidence) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // 문제 위치 식별
      const issueLocations = this.findIssueLocations(lines, pattern, evidence);

      if (issueLocations.length === 0) {
        logger.warn(`문제 위치를 찾을 수 없음: ${filePath}`);
        return null;
      }

      // 각 위치에 대한 수정 생성
      const changes = issueLocations.map((location) => this.applyPattern(lines, location, pattern));

      // 수정된 내용 생성
      const patchedContent = this.applyChanges(lines, changes);

      return {
        file: filePath,
        original: content,
        patched: patchedContent,
        changes: changes.map((c) => ({
          line: c.lineNumber,
          type: c.type,
          original: c.original,
          modified: c.modified
        }))
      };
    } catch (err) {
      logger.error(`파일 패치 생성 실패: ${filePath}`, err);
      throw err;
    }
  }

  /**
   * 문제 위치 찾기
   */
  findIssueLocations(lines, pattern, _evidence) {
    const locations = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 패턴 매칭
      for (const detector of pattern.detectors) {
        const regex = new RegExp(detector.pattern);

        if (regex.test(line)) {
          // 컨텍스트 확인 (주변 라인)
          const context = this.getContext(lines, i, 5);

          if (this.validateContext(context, detector.context)) {
            locations.push({
              lineNumber: i + 1,
              line,
              detector,
              context
            });
          }
        }
      }
    }

    return locations;
  }

  /**
   * 패턴 적용
   */
  applyPattern(lines, location, pattern) {
    const { lineNumber } = location;
    const fix = pattern.fix;

    switch (fix.type) {
      case 'wrap_try_finally':
        return this.wrapTryFinally(lines, lineNumber, fix);

      case 'add_error_handling':
        return this.addErrorHandling(lines, lineNumber, fix);

      case 'add_cleanup':
        return this.addCleanup(lines, lineNumber, fix);

      case 'add_timeout':
        return this.addTimeout(lines, lineNumber, fix);

      case 'replace_cache':
        return this.replaceCache(lines, lineNumber, fix);

      default:
        throw new Error(`알 수 없는 패치 타입: ${fix.type}`);
    }
  }

  /**
   * try-finally로 감싸기
   */
  wrapTryFinally(lines, lineNumber, fix) {
    const indent = this.getIndent(lines[lineNumber - 1]);
    const blockStart = this.findBlockStart(lines, lineNumber - 1);
    const blockEnd = this.findBlockEnd(lines, lineNumber - 1);

    return {
      type: 'wrap',
      lineNumber,
      start: blockStart,
      end: blockEnd,
      original: lines.slice(blockStart, blockEnd + 1).join('\n'),
      modified: [
        `${indent}try {`,
        ...lines.slice(blockStart, blockEnd + 1),
        `${indent}} finally {`,
        `${indent}  ${fix.cleanup}`,
        `${indent}}`
      ].join('\n')
    };
  }

  /**
   * 에러 핸들링 추가
   */
  addErrorHandling(lines, lineNumber, fix) {
    const indent = this.getIndent(lines[lineNumber - 1]);
    const blockStart = this.findBlockStart(lines, lineNumber - 1);
    const blockEnd = this.findBlockEnd(lines, lineNumber - 1);

    return {
      type: 'wrap',
      lineNumber,
      start: blockStart,
      end: blockEnd,
      original: lines.slice(blockStart, blockEnd + 1).join('\n'),
      modified: [
        `${indent}try {`,
        ...lines.slice(blockStart, blockEnd + 1),
        `${indent}} catch (error) {`,
        `${indent}  ${fix.errorHandler}`,
        `${indent}  throw error;`,
        `${indent}}`
      ].join('\n')
    };
  }

  /**
   * 정리 코드 추가
   */
  addCleanup(lines, lineNumber, fix) {
    const indent = this.getIndent(lines[lineNumber - 1]);
    const insertLine = lineNumber; // 해당 라인 다음에 추가

    return {
      type: 'insert',
      lineNumber: insertLine,
      original: '',
      modified: `${indent}${fix.cleanup}`
    };
  }

  /**
   * 타임아웃 추가
   */
  addTimeout(lines, lineNumber, fix) {
    const line = lines[lineNumber - 1];
    const _indent = this.getIndent(line);

    // fetch, axios 등의 호출에 타임아웃 추가
    let modified = line;

    if (line.includes('fetch(')) {
      modified = line.replace(/fetch\(([^)]+)\)/, `fetch($1, { signal: AbortSignal.timeout(${fix.timeoutMs}) })`);
    } else if (line.includes('axios.')) {
      modified = line.replace(/axios\.(\w+)\(([^)]+)\)/, `axios.$1($2, { timeout: ${fix.timeoutMs} })`);
    }

    return {
      type: 'replace',
      lineNumber,
      original: line,
      modified
    };
  }

  /**
   * 캐시 교체 (unbounded -> LRU)
   */
  replaceCache(lines, _lineNumber, fix) {
    const changes = [];

    // 1. 캐시 선언 찾기
    const cacheDecl = lines.findIndex((l) => l.includes('const cache = {}'));
    if (cacheDecl >= 0) {
      changes.push({
        type: 'replace',
        lineNumber: cacheDecl + 1,
        original: lines[cacheDecl],
        modified: `const LRU = require('lru-cache');\nconst cache = new LRU({ max: ${fix.maxSize}, maxAge: ${fix.maxAge} });`
      });
    }

    // 2. cache[key] -> cache.get/set 변경
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('cache[')) {
        const modified = lines[i]
          .replace(/cache\[([^\]]+)\]/g, 'cache.get($1)')
          .replace(/cache\.get\(([^)]+)\)\s*=/, 'cache.set($1,');

        if (modified !== lines[i]) {
          changes.push({
            type: 'replace',
            lineNumber: i + 1,
            original: lines[i],
            modified
          });
        }
      }
    }

    return changes[0]; // 첫 번째 변경 반환 (단순화)
  }

  /**
   * 변경사항 적용
   */
  applyChanges(lines, changes) {
    const newLines = [...lines];

    // 변경사항을 역순으로 적용 (라인 번호 변경 방지)
    const sortedChanges = changes.sort((a, b) => b.lineNumber - a.lineNumber);

    for (const change of sortedChanges) {
      const idx = change.lineNumber - 1;

      switch (change.type) {
        case 'replace':
          newLines[idx] = change.modified;
          break;

        case 'insert':
          newLines.splice(idx + 1, 0, change.modified);
          break;

        case 'wrap': {
          const wrappedLines = change.modified.split('\n');
          newLines.splice(change.start, change.end - change.start + 1, ...wrappedLines);
          break;
        }
      }
    }

    return newLines.join('\n');
  }

  /**
   * 패턴 매칭
   */
  findMatchingPattern(issueType, evidence) {
    for (const pattern of this.patterns) {
      if (pattern.types.includes(issueType)) {
        // 증거와 패턴 매칭
        const matches = evidence.some((e) => pattern.keywords.some((k) => e.toLowerCase().includes(k.toLowerCase())));

        if (matches) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * 컨텍스트 가져오기
   */
  getContext(lines, lineIndex, radius) {
    const start = Math.max(0, lineIndex - radius);
    const end = Math.min(lines.length, lineIndex + radius + 1);
    return lines.slice(start, end);
  }

  /**
   * 컨텍스트 검증
   */
  validateContext(context, requirements) {
    if (!requirements) return true;

    return requirements.every((req) => context.some((line) => line.includes(req)));
  }

  /**
   * 들여쓰기 가져오기
   */
  getIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  /**
   * 블록 시작 찾기
   */
  findBlockStart(lines, fromLine) {
    // 간단 구현: 현재 라인 또는 이전 함수 시작
    for (let i = fromLine; i >= 0; i--) {
      if (lines[i].trim().startsWith('function') || lines[i].trim().startsWith('async function')) {
        return i + 1; // 함수 선언 다음 줄부터
      }
    }
    return fromLine;
  }

  /**
   * 블록 끝 찾기
   */
  findBlockEnd(lines, fromLine) {
    // 간단 구현: return 문 또는 함수 끝
    for (let i = fromLine; i < lines.length; i++) {
      if (lines[i].trim().startsWith('return') || lines[i].trim() === '}') {
        return i;
      }
    }
    return fromLine;
  }

  /**
   * 신뢰도 계산
   */
  calculateConfidence(pattern, evidence) {
    const keywordMatches = evidence.filter((e) =>
      pattern.keywords.some((k) => e.toLowerCase().includes(k.toLowerCase()))
    ).length;

    const confidence = Math.min(0.5 + keywordMatches * 0.15, 0.95);
    return parseFloat(confidence.toFixed(2));
  }

  /**
   * 패치 ID 생성
   */
  generatePatchId() {
    return `patch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 기본 패턴
   */
  getDefaultPatterns() {
    return [
      {
        name: 'connection_leak',
        types: ['connection_leak', 'resource_leak'],
        keywords: ['close', 'release', 'connection', 'finally'],
        detectors: [
          {
            pattern: 'getConnection|createConnection',
            context: ['await', 'const']
          }
        ],
        fix: {
          type: 'wrap_try_finally',
          cleanup: 'connection.close();'
        }
      },
      {
        name: 'missing_error_handling',
        types: ['unhandled_error', 'exception'],
        keywords: ['catch', 'error', 'exception', 'try'],
        detectors: [
          {
            pattern: 'await\\s+\\w+',
            context: []
          }
        ],
        fix: {
          type: 'add_error_handling',
          errorHandler: 'logger.error("Operation failed", error);'
        }
      },
      {
        name: 'missing_timeout',
        types: ['timeout', 'hang'],
        keywords: ['fetch', 'axios', 'request', 'timeout'],
        detectors: [
          {
            pattern: 'fetch\\(|axios\\.',
            context: []
          }
        ],
        fix: {
          type: 'add_timeout',
          timeoutMs: 30000
        }
      }
    ];
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      generatedPatches: this.generatedPatches.length,
      patterns: this.patterns.length
    };
  }
}

export default PatchGenerator;
