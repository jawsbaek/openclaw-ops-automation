/**
 * Log Collector Tests
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import LogCollector from '../../../src/diagnostic/log-collector.js';

describe('LogCollector', () => {
  let logCollector;
  let mockSshExecutor;

  beforeEach(() => {
    mockSshExecutor = {
      execute: jest.fn()
    };
    logCollector = new LogCollector(mockSshExecutor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collect()', () => {
    test('should collect logs from multiple servers', async () => {
      const mockResult = {
        success: true,
        results: [
          {
            host: 'server1',
            success: true,
            stdout: '2026-02-02T10:00:00Z INFO Log message 1\n2026-02-02T10:01:00Z ERROR Error message'
          },
          {
            host: 'server2',
            success: true,
            stdout: '2026-02-02T10:02:00Z WARN Warning message'
          }
        ]
      };

      mockSshExecutor.execute.mockResolvedValue(mockResult);

      const result = await logCollector.collect({
        targets: ['server1', 'server2'],
        logPath: '/var/log/app.log',
        timeRange: { since: '1 hour ago' }
      });

      expect(result.success).toBe(true);
      expect(result.logs).toBeDefined();
      expect(result.summary.hosts).toBe(2);
      expect(mockSshExecutor.execute).toHaveBeenCalledWith({
        target: ['server1', 'server2'],
        command: expect.any(String),
        options: {
          parallel: true,
          timeout: 60000
        }
      });
    });

    test('should apply filters to log collection', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.collect({
        targets: ['server1'],
        logPath: '/var/log/app.log',
        filters: ['ERROR', 'WARN']
      });

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('grep -E');
      expect(executedCommand).toContain('ERROR\\|WARN');
    });

    test('should respect maxSize limit', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.collect({
        targets: ['server1'],
        logPath: '/var/log/app.log',
        maxSize: 1024 * 1024 // 1MB
      });

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('tail -n');
    });

    test('should include error summary in results', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{
          host: 'server1',
          success: true,
          stdout: '2026-02-02T10:00:00Z ERROR First error\n2026-02-02T10:01:00Z INFO Normal log\n2026-02-02T10:02:00Z FATAL Fatal error'
        }]
      });

      const result = await logCollector.collect({
        targets: ['server1'],
        logPath: '/var/log/app.log'
      });

      expect(result.summary.errors.length).toBeGreaterThan(0);
    });
  });

  describe('search()', () => {
    test('should search for pattern in logs', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{
          host: 'server1',
          success: true,
          stdout: 'Line with error pattern\nAnother line with error\nNormal line'
        }]
      });

      const result = await logCollector.search({
        targets: ['server1'],
        logPath: '/var/log/app.log',
        pattern: 'error'
      });

      expect(result.success).toBe(true);
      expect(result.matchCount).toBe(2);
      expect(result.matches.length).toBe(2);
      expect(result.pattern).toBe('error');
    });

    test('should include context lines when specified', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.search({
        targets: ['server1'],
        logPath: '/var/log/app.log',
        pattern: 'ERROR',
        contextLines: 5
      });

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('A5');
      expect(executedCommand).toContain('B5');
    });

    test('should work with timeRange', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.search({
        targets: ['server1'],
        logPath: '/var/log/app.log',
        pattern: 'ERROR',
        timeRange: { since: '1 hour ago', until: 'now' }
      });

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('journalctl');
      expect(executedCommand).toContain('--since');
      expect(executedCommand).toContain('--until');
    });
  });

  describe('collectErrors()', () => {
    test('should collect error logs from targets', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{
          host: 'server1',
          success: true,
          stdout: 'ERROR: Something went wrong\nFATAL: Critical failure\nException in thread'
        }]
      });

      const result = await logCollector.collectErrors(
        ['server1'],
        '/var/log/app.log',
        '1 hour ago'
      );

      expect(result.success).toBe(true);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeLessThanOrEqual(100);
    });

    test('should use default time range when not specified', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.collectErrors(['server1'], '/var/log/app.log');

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('1 hour ago');
    });

    test('should search for multiple error patterns', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await logCollector.collectErrors(['server1'], '/var/log/app.log');

      const executedCommand = mockSshExecutor.execute.mock.calls[0][0].command;
      expect(executedCommand).toContain('ERROR\\|FATAL\\|Exception');
    });
  });

  describe('parseLogLine()', () => {
    test('should parse ISO 8601 format', () => {
      const line = '2026-02-02T10:00:00.123Z INFO Application started';
      const parsed = logCollector.parseLogLine(line, 'server1');

      expect(parsed.timestamp).toBe('2026-02-02T10:00:00.123Z');
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Application started');
      expect(parsed.host).toBe('server1');
    });

    test('should parse Syslog format', () => {
      const line = 'Feb 2 10:00:00 hostname kernel: message';
      const parsed = logCollector.parseLogLine(line, 'server2');

      expect(parsed.timestamp).toBe('Feb 2 10:00:00');
      expect(parsed.level).toBe('hostname');
      expect(parsed.message).toBe('kernel: message');
      expect(parsed.host).toBe('server2');
    });

    test('should parse Nginx format', () => {
      const line = '[02/Feb/2026:10:00:00 +0000] GET /api/endpoint HTTP/1.1';
      const parsed = logCollector.parseLogLine(line, 'web1');

      expect(parsed.timestamp).toBe('02/Feb/2026:10:00:00 +0000');
      expect(parsed.message).toBe('GET /api/endpoint HTTP/1.1');
      expect(parsed.host).toBe('web1');
    });

    test('should handle lines without timestamp', () => {
      const line = 'Plain log message without timestamp';
      const parsed = logCollector.parseLogLine(line, 'server1');

      expect(parsed.timestamp).toBeNull();
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe(line);
      expect(parsed.raw).toBe(line);
    });
  });

  describe('extractErrors()', () => {
    test('should extract logs with ERROR level', () => {
      const logs = [
        { level: 'INFO', message: 'Normal log' },
        { level: 'ERROR', message: 'Error occurred' },
        { level: 'WARN', message: 'Warning' },
        { level: 'FATAL', message: 'Fatal error' }
      ];

      const errors = logCollector.extractErrors(logs);

      expect(errors.length).toBe(2);
      expect(errors[0].level).toBe('ERROR');
      expect(errors[1].level).toBe('FATAL');
    });

    test('should extract logs with error keywords in message', () => {
      const logs = [
        { level: 'INFO', message: 'Connection error detected' },
        { level: 'INFO', message: 'Exception thrown' },
        { level: 'INFO', message: 'Operation failed' }
      ];

      const errors = logCollector.extractErrors(logs);

      expect(errors.length).toBe(3);
    });

    test('should handle case-insensitive matching', () => {
      const logs = [
        { level: 'error', message: 'lowercase error' },
        { level: 'Error', message: 'Mixed case' }
      ];

      const errors = logCollector.extractErrors(logs);

      expect(errors.length).toBe(2);
    });
  });

  describe('extractTimestamp()', () => {
    test('should extract ISO timestamp', () => {
      const line = 'Some text 2026-02-02T10:00:00 more text';
      const timestamp = logCollector.extractTimestamp(line);

      expect(timestamp).toBe('2026-02-02T10:00:00');
    });

    test('should extract syslog timestamp', () => {
      const line = 'Feb 2 10:00:00 hostname message';
      const timestamp = logCollector.extractTimestamp(line);

      expect(timestamp).toBe('Feb 2 10:00:00');
    });

    test('should return null for lines without timestamp', () => {
      const line = 'No timestamp here';
      const timestamp = logCollector.extractTimestamp(line);

      expect(timestamp).toBeNull();
    });
  });

  describe('parseAndMerge()', () => {
    test('should merge logs from multiple results', () => {
      const results = [
        {
          host: 'server1',
          success: true,
          stdout: '2026-02-02T10:00:00Z INFO Message 1'
        },
        {
          host: 'server2',
          success: true,
          stdout: '2026-02-02T09:00:00Z WARN Message 2'
        }
      ];

      const merged = logCollector.parseAndMerge(results);

      expect(merged.length).toBe(2);
      expect(merged[0].host).toBe('server2'); // Earlier timestamp
      expect(merged[1].host).toBe('server1');
    });

    test('should skip failed results', () => {
      const results = [
        { host: 'server1', success: false, stdout: '' },
        { host: 'server2', success: true, stdout: '2026-02-02T10:00:00Z INFO Message' }
      ];

      const merged = logCollector.parseAndMerge(results);

      expect(merged.length).toBe(1);
      expect(merged[0].host).toBe('server2');
    });

    test('should filter empty lines', () => {
      const results = [{
        host: 'server1',
        success: true,
        stdout: '2026-02-02T10:00:00Z INFO Message\n\n\n'
      }];

      const merged = logCollector.parseAndMerge(results);

      expect(merged.length).toBe(1);
    });

    test('should sort by timestamp', () => {
      const results = [{
        host: 'server1',
        success: true,
        stdout: '2026-02-02T10:03:00Z INFO Third\n2026-02-02T10:01:00Z INFO First\n2026-02-02T10:02:00Z INFO Second'
      }];

      const merged = logCollector.parseAndMerge(results);

      expect(merged[0].message).toBe('First');
      expect(merged[1].message).toBe('Second');
      expect(merged[2].message).toBe('Third');
    });
  });

  describe('buildLogCommands()', () => {
    test('should build journalctl command with timeRange', () => {
      const commands = logCollector.buildLogCommands(
        '/var/log/app.log',
        { since: '1 hour ago', until: 'now' },
        [],
        100 * 1024 * 1024
      );

      expect(commands.collect).toContain('journalctl');
      expect(commands.collect).toContain('--since "1 hour ago"');
      expect(commands.collect).toContain('--until "now"');
    });

    test('should build tail command without timeRange', () => {
      const commands = logCollector.buildLogCommands(
        '/var/log/app.log',
        null,
        [],
        100 * 1024 * 1024
      );

      expect(commands.collect).toContain('tail -n');
      expect(commands.collect).toContain('/var/log/app.log');
    });

    test('should add grep filter when filters provided', () => {
      const commands = logCollector.buildLogCommands(
        '/var/log/app.log',
        null,
        ['ERROR', 'WARN'],
        100 * 1024 * 1024
      );

      expect(commands.collect).toContain('grep -E "ERROR\\|WARN"');
    });

    test('should include count command', () => {
      const commands = logCollector.buildLogCommands(
        '/var/log/app.log',
        null,
        [],
        100 * 1024 * 1024
      );

      expect(commands.count).toContain('wc -l');
    });
  });

  describe('buildGrepCommand()', () => {
    test('should build grep command for file', () => {
      const command = logCollector.buildGrepCommand(
        '/var/log/app.log',
        'ERROR',
        null,
        3
      );

      expect(command).toContain('grep -iA3');
      expect(command).toContain('B3');
      expect(command).toContain('ERROR');
      expect(command).toContain('/var/log/app.log');
      expect(command).toContain('tail -500');
    });

    test('should build journalctl grep with timeRange', () => {
      const command = logCollector.buildGrepCommand(
        '/var/log/app.log',
        'ERROR',
        { since: '1 hour ago', until: 'now' },
        2
      );

      expect(command).toContain('journalctl');
      expect(command).toContain('--since "1 hour ago"');
      expect(command).toContain('--until "now"');
      expect(command).toContain('grep -iA2');
      expect(command).toContain('B2');
    });

    test('should work without context lines', () => {
      const command = logCollector.buildGrepCommand(
        '/var/log/app.log',
        'ERROR',
        null,
        0
      );

      expect(command).toContain('grep -i');
      expect(command).not.toContain('-A');
      expect(command).not.toContain('-B');
    });
  });

  describe('recordCollection() and getStatus()', () => {
    test('should record collection history', () => {
      const options = {
        targets: ['server1', 'server2'],
        logPath: '/var/log/app.log'
      };
      const logs = [
        { level: 'ERROR', message: 'Error 1' },
        { level: 'INFO', message: 'Info 1' }
      ];

      logCollector.recordCollection(options, logs);

      const status = logCollector.getStatus();
      expect(status.recentCollections.length).toBe(1);
      expect(status.recentCollections[0].targets).toEqual(['server1', 'server2']);
      expect(status.recentCollections[0].logCount).toBe(2);
      expect(status.recentCollections[0].errorCount).toBe(1);
    });

    test('should limit history to 100 entries', () => {
      const options = { targets: ['server1'], logPath: '/var/log/app.log' };

      for (let i = 0; i < 150; i++) {
        logCollector.recordCollection(options, []);
      }

      expect(logCollector.collectionHistory.length).toBe(100);
    });

    test('should return recent collections in getStatus()', () => {
      for (let i = 0; i < 15; i++) {
        logCollector.recordCollection(
          { targets: [`server${i}`], logPath: '/var/log/app.log' },
          []
        );
      }

      const status = logCollector.getStatus();
      expect(status.recentCollections.length).toBe(10);
    });
  });

  describe('parseSearchResults()', () => {
    test('should parse search results correctly', () => {
      const results = [
        {
          host: 'server1',
          success: true,
          stdout: 'Line with pattern\nAnother pattern match'
        },
        {
          host: 'server2',
          success: true,
          stdout: 'No match here'
        }
      ];

      const parsed = logCollector.parseSearchResults(results, 'pattern');

      expect(parsed.success).toBe(true);
      expect(parsed.pattern).toBe('pattern');
      expect(parsed.matchCount).toBe(2);
      expect(parsed.matches.length).toBe(2);
      expect(parsed.matches[0].host).toBe('server1');
    });

    test('should handle failed results', () => {
      const results = [
        { host: 'server1', success: false, stdout: '' }
      ];

      const parsed = logCollector.parseSearchResults(results, 'pattern');

      expect(parsed.matchCount).toBe(0);
      expect(parsed.matches.length).toBe(0);
    });
  });

  describe('parseErrorLogs()', () => {
    test('should parse error logs with timestamps', () => {
      const results = [{
        host: 'server1',
        success: true,
        stdout: '2026-02-02T10:00:00 ERROR First error\nFeb 2 10:01:00 FATAL Second error'
      }];

      const parsed = logCollector.parseErrorLogs(results);

      expect(parsed.success).toBe(true);
      expect(parsed.errorCount).toBe(2);
      expect(parsed.errors[0].timestamp).toBeTruthy();
      expect(parsed.errors[1].timestamp).toBeTruthy();
    });

    test('should limit results to 100 errors', () => {
      const manyErrors = Array(200).fill('ERROR: Test error').join('\n');
      const results = [{
        host: 'server1',
        success: true,
        stdout: manyErrors
      }];

      const parsed = logCollector.parseErrorLogs(results);

      expect(parsed.errors.length).toBe(100);
    });

    test('should filter empty lines', () => {
      const results = [{
        host: 'server1',
        success: true,
        stdout: 'ERROR: First\n\n\nERROR: Second'
      }];

      const parsed = logCollector.parseErrorLogs(results);

      expect(parsed.errorCount).toBe(2);
    });
  });
});
