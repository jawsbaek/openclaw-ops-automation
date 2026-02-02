/**
 * Log Collector
 * 분산 환경에서 로그를 병렬로 수집하고 분석
 */

const logger = require('../../lib/logger');

class LogCollector {
  constructor(sshExecutor) {
    this.sshExecutor = sshExecutor;
    this.collectionHistory = [];
  }

  /**
   * 여러 서버에서 로그 수집
   */
  async collect(options) {
    const {
      targets,
      logPath,
      timeRange,
      filters = [],
      maxSize = 100 * 1024 * 1024 // 100MB
    } = options;

    logger.info(`로그 수집 시작: ${logPath} from ${targets.join(', ')}`);

    const commands = this.buildLogCommands(logPath, timeRange, filters, maxSize);
    
    const results = await this.sshExecutor.execute({
      target: targets,
      command: commands.collect,
      options: {
        parallel: true,
        timeout: 60000
      }
    });

    // 로그 파싱 및 통합
    const logs = this.parseAndMerge(results.results);

    // 수집 이력 저장
    this.recordCollection(options, logs);

    return {
      success: true,
      logs,
      summary: {
        totalLines: logs.length,
        hosts: targets.length,
        timeRange,
        errors: this.extractErrors(logs)
      }
    };
  }

  /**
   * 특정 패턴 검색
   */
  async search(options) {
    const {
      targets,
      logPath,
      pattern,
      timeRange,
      contextLines = 3
    } = options;

    const grepCommand = this.buildGrepCommand(logPath, pattern, timeRange, contextLines);

    const results = await this.sshExecutor.execute({
      target: targets,
      command: grepCommand,
      options: { parallel: true }
    });

    return this.parseSearchResults(results.results, pattern);
  }

  /**
   * 에러 로그 추출
   */
  async collectErrors(targets, logPath, since = '1 hour ago') {
    const errorPatterns = [
      'ERROR',
      'FATAL',
      'Exception',
      'Error:',
      'failed',
      'timeout',
      'cannot',
      'unable to'
    ];

    const pattern = errorPatterns.join('\\|');
    const command = `journalctl --since "${since}" | grep -iE "${pattern}" || tail -1000 ${logPath} | grep -iE "${pattern}"`;

    const results = await this.sshExecutor.execute({
      target: targets,
      command,
      options: { parallel: true, timeout: 30000 }
    });

    return this.parseErrorLogs(results.results);
  }

  /**
   * 로그 스트리밍 (실시간)
   */
  async stream(options) {
    const { target, logPath, onData, duration = 60000 } = options;

    logger.info(`로그 스트리밍 시작: ${logPath} on ${target}`);

    // tail -f 대신 짧은 간격으로 새 라인 가져오기
    const interval = 2000;
    let lastLines = 0;

    const streamInterval = setInterval(async () => {
      try {
        const command = `tail -n +${lastLines + 1} ${logPath} | head -100`;
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 5000 }
        });

        if (result.success && result.results[0].stdout) {
          const lines = result.results[0].stdout.split('\n').filter(l => l.trim());
          lastLines += lines.length;
          
          if (lines.length > 0 && onData) {
            onData(lines);
          }
        }
      } catch (err) {
        logger.error('스트리밍 오류', err);
      }
    }, interval);

    // 지정된 시간 후 중지
    setTimeout(() => {
      clearInterval(streamInterval);
      logger.info('로그 스트리밍 종료');
    }, duration);

    return { streaming: true, duration };
  }

  /**
   * 로그 명령 생성
   */
  buildLogCommands(logPath, timeRange, filters, maxSize) {
    let command = '';

    if (timeRange) {
      const { since, until } = timeRange;
      command = `journalctl --since "${since}"`;
      if (until) {
        command += ` --until "${until}"`;
      }
    } else {
      // 파일 기반
      const maxLines = Math.floor(maxSize / 200); // 평균 200바이트/라인 가정
      command = `tail -n ${maxLines} ${logPath}`;
    }

    // 필터 적용
    if (filters.length > 0) {
      const filterPattern = filters.join('\\|');
      command += ` | grep -E "${filterPattern}"`;
    }

    return {
      collect: command,
      count: command + ' | wc -l'
    };
  }

  /**
   * Grep 명령 생성
   */
  buildGrepCommand(logPath, pattern, timeRange, contextLines) {
    let command = '';

    if (timeRange) {
      command = `journalctl --since "${timeRange.since}"`;
      if (timeRange.until) {
        command += ` --until "${timeRange.until}"`;
      }
      command += ` | grep -i${contextLines > 0 ? 'A' + contextLines + ' -B' + contextLines : ''} "${pattern}"`;
    } else {
      command = `grep -i${contextLines > 0 ? 'A' + contextLines + ' -B' + contextLines : ''} "${pattern}" ${logPath} | tail -500`;
    }

    return command;
  }

  /**
   * 로그 파싱 및 병합
   */
  parseAndMerge(results) {
    const allLogs = [];

    for (const result of results) {
      if (!result.success || !result.stdout) {
        continue;
      }

      const lines = result.stdout.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = this.parseLogLine(line, result.host);
        if (parsed) {
          allLogs.push(parsed);
        }
      }
    }

    // 타임스탬프로 정렬
    allLogs.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      return 0;
    });

    return allLogs;
  }

  /**
   * 로그 라인 파싱
   */
  parseLogLine(line, host) {
    // 여러 로그 포맷 지원
    const formats = [
      // ISO 8601: 2026-02-02T02:45:30.123Z
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\s+(\w+)\s+(.+)$/,
      // Syslog: Feb 2 02:45:30
      /^(\w+\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\w+)\s+(.+)$/,
      // Nginx: 02/Feb/2026:02:45:30 +0000
      /^\[(\d{2}\/\w+\/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\]\s+(.+)$/
    ];

    for (const format of formats) {
      const match = line.match(format);
      if (match) {
        return {
          timestamp: match[1],
          level: match[2] || 'INFO',
          message: match[3] || match[2],
          host,
          raw: line
        };
      }
    }

    // 타임스탬프 없는 라인
    return {
      timestamp: null,
      level: 'INFO',
      message: line,
      host,
      raw: line
    };
  }

  /**
   * 에러 추출
   */
  extractErrors(logs) {
    return logs.filter(log => {
      const level = (log.level || '').toUpperCase();
      const message = (log.message || '').toLowerCase();
      
      return level === 'ERROR' || 
             level === 'FATAL' || 
             message.includes('error') ||
             message.includes('exception') ||
             message.includes('failed');
    });
  }

  /**
   * 검색 결과 파싱
   */
  parseSearchResults(results, pattern) {
    const matches = [];

    for (const result of results) {
      if (!result.success || !result.stdout) {
        continue;
      }

      const lines = result.stdout.split('\n');
      
      for (const line of lines) {
        if (line.includes(pattern)) {
          matches.push({
            host: result.host,
            line: line.trim(),
            matched: pattern
          });
        }
      }
    }

    return {
      success: true,
      pattern,
      matchCount: matches.length,
      matches
    };
  }

  /**
   * 에러 로그 파싱
   */
  parseErrorLogs(results) {
    const errors = [];

    for (const result of results) {
      if (!result.success || !result.stdout) {
        continue;
      }

      const lines = result.stdout.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          errors.push({
            host: result.host,
            message: trimmed,
            timestamp: this.extractTimestamp(trimmed)
          });
        }
      }
    }

    return {
      success: true,
      errorCount: errors.length,
      errors: errors.slice(0, 100) // 최대 100개
    };
  }

  /**
   * 타임스탬프 추출
   */
  extractTimestamp(line) {
    const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }

    const syslogMatch = line.match(/\w+\s+\d+\s+\d{2}:\d{2}:\d{2}/);
    if (syslogMatch) {
      return syslogMatch[0];
    }

    return null;
  }

  /**
   * 수집 이력 기록
   */
  recordCollection(options, logs) {
    this.collectionHistory.push({
      timestamp: new Date().toISOString(),
      targets: options.targets,
      logPath: options.logPath,
      logCount: logs.length,
      errorCount: this.extractErrors(logs).length
    });

    // 최대 100개 유지
    if (this.collectionHistory.length > 100) {
      this.collectionHistory.shift();
    }
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      recentCollections: this.collectionHistory.slice(-10)
    };
  }
}

module.exports = LogCollector;
