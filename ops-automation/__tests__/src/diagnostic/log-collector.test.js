/**
 * Tests for Log Collector
 * @fileoverview Unit tests for log collection and parsing logic
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import LogCollector from '../../../src/diagnostic/log-collector.js';

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

// Test constants
const DEFAULT_MAX_BYTES = 1000000;
const LARGE_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const CONTEXT_LINES = 3;
const _DEFAULT_TAIL_LINES = 1000;

describe('LogCollector', () => {
  let collector;
  let mockSSHExecutor;

  beforeEach(() => {
    mockSSHExecutor = {
      execute: () => Promise.resolve({ success: true, results: [] })
    };

    collector = new LogCollector(mockSSHExecutor);
  });

  describe('Constructor', () => {
    test('should initialize with SSH executor', () => {
      expect(collector.sshExecutor).toBe(mockSSHExecutor);
    });

    test('should initialize empty collection history', () => {
      expect(collector.collectionHistory).toEqual([]);
    });
  });

  describe('buildLogCommands', () => {
    test('should build command for time range', () => {
      const timeRange = { since: '1 hour ago', until: '10 minutes ago' };
      const commands = collector.buildLogCommands(null, timeRange, [], DEFAULT_MAX_BYTES);

      expect(commands.collect).toContain('journalctl');
      expect(commands.collect).toContain('--since "1 hour ago"');
      expect(commands.collect).toContain('--until "10 minutes ago"');
    });

    test('should build command for file-based logs', () => {
      const commands = collector.buildLogCommands('/var/log/app.log', null, [], LARGE_FILE_SIZE_BYTES);

      expect(commands.collect).toContain('tail -n');
      expect(commands.collect).toContain('/var/log/app.log');
    });

    test('should add filters to command', () => {
      const filters = ['ERROR', 'WARN'];
      const commands = collector.buildLogCommands('/var/log/app.log', null, filters, DEFAULT_MAX_BYTES);

      expect(commands.collect).toContain('grep -E');
      expect(commands.collect).toContain('ERROR\\|WARN');
    });

    test('should include count command', () => {
      const commands = collector.buildLogCommands('/var/log/app.log', null, [], DEFAULT_MAX_BYTES);

      expect(commands.count).toContain('wc -l');
    });
  });

  describe('buildGrepCommand', () => {
    test('should build grep with time range', () => {
      const timeRange = { since: '1 hour ago' };
      const command = collector.buildGrepCommand(null, 'ERROR', timeRange, 0);

      expect(command).toContain('journalctl');
      expect(command).toContain('--since');
      expect(command).toContain('grep');
      expect(command).toContain('ERROR');
    });

    test('should build grep with context lines', () => {
      const command = collector.buildGrepCommand('/var/log/app.log', 'ERROR', null, CONTEXT_LINES);

      expect(command).toContain('grep');
      expect(command).toContain(`-iA${CONTEXT_LINES}`);
      expect(command).toContain(`-B${CONTEXT_LINES}`);
    });

    test('should build grep without context lines', () => {
      const command = collector.buildGrepCommand('/var/log/app.log', 'ERROR', null, 0);

      expect(command).toContain('grep -i');
      expect(command).not.toContain('-A');
      expect(command).not.toContain('-B');
    });
  });

  describe('parseLogLine', () => {
    test('should parse ISO 8601 timestamp', () => {
      const line = '2026-02-02T02:45:30.123Z INFO Application started';
      const parsed = collector.parseLogLine(line, 'host1');

      expect(parsed.timestamp).toBe('2026-02-02T02:45:30.123Z');
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Application started');
      expect(parsed.host).toBe('host1');
    });

    test('should parse syslog format', () => {
      const line = 'Feb 2 02:45:30 ERROR Service failed';
      const parsed = collector.parseLogLine(line, 'host1');

      expect(parsed.timestamp).toBe('Feb 2 02:45:30');
      expect(parsed.level).toBe('ERROR');
      expect(parsed.host).toBe('host1');
    });

    test('should handle line without timestamp', () => {
      const line = 'Simple log message without timestamp';
      const parsed = collector.parseLogLine(line, 'host1');

      expect(parsed.timestamp).toBeNull();
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe(line);
      expect(parsed.raw).toBe(line);
    });
  });

  describe('extractErrors', () => {
    test('should extract error level logs', () => {
      const logs = [
        { level: 'INFO', message: 'normal log' },
        { level: 'ERROR', message: 'error occurred' },
        { level: 'FATAL', message: 'fatal error' },
        { level: 'DEBUG', message: 'debug info' }
      ];

      const errors = collector.extractErrors(logs);

      expect(errors).toHaveLength(2);
      expect(errors[0].level).toBe('ERROR');
      expect(errors[1].level).toBe('FATAL');
    });

    test('should extract logs with error keywords in message', () => {
      const logs = [
        { level: 'INFO', message: 'normal log' },
        { level: 'INFO', message: 'Connection failed' },
        { level: 'INFO', message: 'Exception thrown' }
      ];

      const errors = collector.extractErrors(logs);

      expect(errors).toHaveLength(2);
      expect(errors[0].message).toContain('failed');
      expect(errors[1].message).toContain('Exception');
    });

    test('should return empty array when no errors', () => {
      const logs = [
        { level: 'INFO', message: 'normal log' },
        { level: 'DEBUG', message: 'debug info' }
      ];

      const errors = collector.extractErrors(logs);

      expect(errors).toEqual([]);
    });
  });

  describe('extractTimestamp', () => {
    test('should extract ISO timestamp', () => {
      const line = '[2026-02-02T02:45:30] ERROR message';
      const timestamp = collector.extractTimestamp(line);

      expect(timestamp).toBe('2026-02-02T02:45:30');
    });

    test('should extract syslog timestamp', () => {
      const line = 'Feb 2 02:45:30 hostname ERROR message';
      const timestamp = collector.extractTimestamp(line);

      expect(timestamp).toBe('Feb 2 02:45:30');
    });

    test('should return null when no timestamp found', () => {
      const line = 'No timestamp in this line';
      const timestamp = collector.extractTimestamp(line);

      expect(timestamp).toBeNull();
    });
  });

  describe('parseAndMerge', () => {
    test('should merge logs from multiple hosts', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: '2026-02-02T02:45:30Z INFO Log from host1\n2026-02-02T02:45:31Z INFO Another log'
        },
        {
          host: 'host2',
          success: true,
          stdout: '2026-02-02T02:45:29Z INFO Log from host2'
        }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(3);
      expect(logs[0].host).toBe('host2'); // Earlier timestamp
      expect(logs[1].host).toBe('host1');
      expect(logs[2].host).toBe('host1');
    });

    test('should skip failed results', () => {
      const results = [
        {
          host: 'host1',
          success: false,
          stdout: 'Error output'
        },
        {
          host: 'host2',
          success: true,
          stdout: '2026-02-02T02:45:30Z INFO Valid log'
        }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(1);
      expect(logs[0].host).toBe('host2');
    });

    test('should skip empty lines', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: '2026-02-02T02:45:30Z INFO Log line\n\n\n2026-02-02T02:45:31Z INFO Another line'
        }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(2);
    });
  });

  describe('recordCollection', () => {
    test('should add to collection history', () => {
      const options = {
        targets: ['host1', 'host2'],
        logPath: '/var/log/app.log'
      };
      const logs = [
        { level: 'INFO', message: 'log1' },
        { level: 'ERROR', message: 'error1' }
      ];

      collector.recordCollection(options, logs);

      expect(collector.collectionHistory).toHaveLength(1);
      expect(collector.collectionHistory[0].targets).toEqual(['host1', 'host2']);
      expect(collector.collectionHistory[0].logCount).toBe(2);
      expect(collector.collectionHistory[0].errorCount).toBe(1);
    });

    test('should limit history to 100 entries', () => {
      const options = { targets: ['host1'], logPath: '/var/log/app.log' };
      const logs = [];

      // Add 105 records
      for (let i = 0; i < 105; i++) {
        collector.recordCollection(options, logs);
      }

      expect(collector.collectionHistory).toHaveLength(100);
    });
  });

  describe('getStatus', () => {
    test('should return recent collections', () => {
      const options = { targets: ['host1'], logPath: '/var/log/app.log' };

      for (let i = 0; i < 15; i++) {
        collector.recordCollection(options, []);
      }

      const status = collector.getStatus();

      expect(status.recentCollections).toHaveLength(10);
    });
  });

  describe('parseSearchResults', () => {
    test('should extract matches from results', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: 'ERROR: Connection failed\nWARNING: Timeout'
        },
        {
          host: 'host2',
          success: true,
          stdout: 'ERROR: Database unavailable'
        }
      ];

      const parsed = collector.parseSearchResults(results, 'ERROR');

      expect(parsed.success).toBe(true);
      expect(parsed.pattern).toBe('ERROR');
      expect(parsed.matchCount).toBe(2);
      expect(parsed.matches).toHaveLength(2);
      expect(parsed.matches[0].host).toBe('host1');
      expect(parsed.matches[1].host).toBe('host2');
    });
  });

  describe('parseErrorLogs', () => {
    test('should parse error logs from results', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: '2026-02-02T02:45:30 ERROR Connection failed\n2026-02-02T02:45:31 ERROR Timeout'
        }
      ];

      const parsed = collector.parseErrorLogs(results);

      expect(parsed.success).toBe(true);
      expect(parsed.errorCount).toBe(2);
      expect(parsed.errors).toHaveLength(2);
      expect(parsed.errors[0].host).toBe('host1');
    });

    test('should limit errors to 100', () => {
      const lines = Array(150).fill('ERROR message').join('\n');
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: lines
        }
      ];

      const parsed = collector.parseErrorLogs(results);

      expect(parsed.errors).toHaveLength(100);
    });

    test('should skip failed results', () => {
      const results = [
        { host: 'host1', success: false, stdout: 'Error output' },
        { host: 'host2', success: true, stdout: '2026-02-02T02:45:30 ERROR Valid error' }
      ];

      const parsed = collector.parseErrorLogs(results);

      expect(parsed.errorCount).toBe(1);
      expect(parsed.errors[0].host).toBe('host2');
    });

    test('should skip results without stdout', () => {
      const results = [
        { host: 'host1', success: true, stdout: null },
        { host: 'host2', success: true, stdout: '2026-02-02T02:45:30 ERROR Valid error' }
      ];

      const parsed = collector.parseErrorLogs(results);

      expect(parsed.errorCount).toBe(1);
      expect(parsed.errors[0].host).toBe('host2');
    });

    test('should skip empty lines in results', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: 'ERROR line1\n\n\n   \nERROR line2'
        }
      ];

      const parsed = collector.parseErrorLogs(results);

      expect(parsed.errorCount).toBe(2);
    });
  });

  describe('parseSearchResults', () => {
    test('should skip failed results', () => {
      const results = [
        { host: 'host1', success: false, stdout: 'ERROR: output' },
        { host: 'host2', success: true, stdout: 'ERROR: valid result' }
      ];

      const parsed = collector.parseSearchResults(results, 'ERROR');

      expect(parsed.matchCount).toBe(1);
      expect(parsed.matches[0].host).toBe('host2');
    });

    test('should skip results without stdout', () => {
      const results = [
        { host: 'host1', success: true, stdout: undefined },
        { host: 'host2', success: true, stdout: 'ERROR: valid result' }
      ];

      const parsed = collector.parseSearchResults(results, 'ERROR');

      expect(parsed.matchCount).toBe(1);
      expect(parsed.matches[0].host).toBe('host2');
    });

    test('should only include lines containing the pattern', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: 'Line with ERROR\nLine without\nAnother ERROR line'
        }
      ];

      const parsed = collector.parseSearchResults(results, 'ERROR');

      expect(parsed.matchCount).toBe(2);
      expect(parsed.matches[0].line).toContain('ERROR');
      expect(parsed.matches[1].line).toContain('ERROR');
    });
  });

  describe('parseAndMerge - edge cases', () => {
    test('should handle logs without timestamps in sorting', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: 'No timestamp log\nAnother no timestamp'
        },
        {
          host: 'host2',
          success: true,
          stdout: 'Also no timestamp'
        }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(3);
      for (const log of logs) {
        expect(log.timestamp).toBeNull();
      }
    });

    test('should handle mixed timestamp and no-timestamp logs', () => {
      const results = [
        {
          host: 'host1',
          success: true,
          stdout: '2026-02-02T02:45:30Z INFO With timestamp\nNo timestamp here'
        }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(2);
      expect(logs.some((l) => l.timestamp !== null)).toBe(true);
      expect(logs.some((l) => l.timestamp === null)).toBe(true);
    });

    test('should skip results without stdout', () => {
      const results = [
        { host: 'host1', success: true, stdout: undefined },
        { host: 'host2', success: true, stdout: '2026-02-02T02:45:30Z INFO Valid log' }
      ];

      const logs = collector.parseAndMerge(results);

      expect(logs).toHaveLength(1);
      expect(logs[0].host).toBe('host2');
    });
  });

  describe('buildGrepCommand - edge cases', () => {
    test('should include until clause when timeRange has until', () => {
      const timeRange = { since: '1 hour ago', until: '10 minutes ago' };
      const command = collector.buildGrepCommand('/var/log/app.log', 'ERROR', timeRange, 0);

      expect(command).toContain('--until "10 minutes ago"');
    });

    test('should include context lines with journalctl', () => {
      const timeRange = { since: '1 hour ago' };
      const command = collector.buildGrepCommand('/var/log/app.log', 'ERROR', timeRange, 5);

      expect(command).toContain('A5');
      expect(command).toContain('B5');
    });
  });

  describe('collect', () => {
    test('should collect logs from multiple targets', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [
          { host: 'host1', success: true, stdout: '2026-02-02T02:45:30Z INFO Log from host1' },
          { host: 'host2', success: true, stdout: '2026-02-02T02:45:31Z INFO Log from host2' }
        ]
      });

      const result = await collector.collect({
        targets: ['host1', 'host2'],
        logPath: '/var/log/app.log',
        timeRange: { since: '1 hour ago' }
      });

      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.summary.totalLines).toBe(2);
      expect(result.summary.hosts).toBe(2);
      expect(mockSSHExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          target: ['host1', 'host2'],
          options: { parallel: true, timeout: 60000 }
        })
      );
    });

    test('should extract errors in summary', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [
          {
            host: 'host1',
            success: true,
            stdout: '2026-02-02T02:45:30Z INFO Normal log\n2026-02-02T02:45:31Z ERROR Error log'
          }
        ]
      });

      const result = await collector.collect({
        targets: ['host1'],
        logPath: '/var/log/app.log'
      });

      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0].level).toBe('ERROR');
    });

    test('should record collection in history', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ host: 'host1', success: true, stdout: '2026-02-02T02:45:30Z INFO Log' }]
      });

      await collector.collect({
        targets: ['host1'],
        logPath: '/var/log/app.log'
      });

      expect(collector.collectionHistory).toHaveLength(1);
      expect(collector.collectionHistory[0].logPath).toBe('/var/log/app.log');
    });
  });

  describe('search', () => {
    test('should search for patterns across targets', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [
          { host: 'host1', success: true, stdout: 'ERROR: Connection failed' },
          { host: 'host2', success: true, stdout: 'ERROR: Timeout occurred' }
        ]
      });

      const result = await collector.search({
        targets: ['host1', 'host2'],
        logPath: '/var/log/app.log',
        pattern: 'ERROR'
      });

      expect(result.success).toBe(true);
      expect(result.matchCount).toBe(2);
      expect(result.pattern).toBe('ERROR');
    });

    test('should pass context lines option', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: []
      });

      await collector.search({
        targets: ['host1'],
        logPath: '/var/log/app.log',
        pattern: 'ERROR',
        contextLines: 5
      });

      expect(mockSSHExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.stringContaining('A5')
        })
      );
    });
  });

  describe('collectErrors', () => {
    test('should collect error logs from targets', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ host: 'host1', success: true, stdout: '2026-02-02T02:45:30 ERROR Connection failed' }]
      });

      const result = await collector.collectErrors(['host1'], '/var/log/app.log', '1 hour ago');

      expect(result.success).toBe(true);
      expect(result.errorCount).toBe(1);
      expect(mockSSHExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { parallel: true, timeout: 30000 }
        })
      );
    });

    test('should use default since value', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: []
      });

      await collector.collectErrors(['host1'], '/var/log/app.log');

      expect(mockSSHExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.stringContaining('1 hour ago')
        })
      );
    });
  });

  describe('stream', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should return streaming status', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ stdout: '' }]
      });

      const result = await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        duration: 10000
      });

      expect(result.streaming).toBe(true);
      expect(result.duration).toBe(10000);
    });

    test('should call onData when new lines are received', async () => {
      const onData = vi.fn();
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ stdout: 'New log line\nAnother line' }]
      });

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        onData,
        duration: 10000
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(onData).toHaveBeenCalledWith(['New log line', 'Another line']);
    });

    test('should not call onData when no new lines', async () => {
      const onData = vi.fn();
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ stdout: '' }]
      });

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        onData,
        duration: 10000
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(onData).not.toHaveBeenCalled();
    });

    test('should stop streaming after duration', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ stdout: 'Log line' }]
      });

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        duration: 5000
      });

      await vi.advanceTimersByTimeAsync(6000);

      const callCount = mockSSHExecutor.execute.mock.calls.length;
      await vi.advanceTimersByTimeAsync(4000);

      expect(mockSSHExecutor.execute.mock.calls.length).toBe(callCount);
    });

    test('should handle streaming errors gracefully', async () => {
      mockSSHExecutor.execute = vi.fn().mockRejectedValue(new Error('Connection failed'));

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        duration: 10000
      });

      await vi.advanceTimersByTimeAsync(2000);
    });

    test('should handle failed result gracefully', async () => {
      const onData = vi.fn();
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: false,
        results: [{ stdout: 'Should not process' }]
      });

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        onData,
        duration: 10000
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(onData).not.toHaveBeenCalled();
    });

    test('should increment lastLines counter correctly', async () => {
      const onData = vi.fn();
      let callCount = 0;

      mockSSHExecutor.execute = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ success: true, results: [{ stdout: 'Line 1\nLine 2' }] });
        }
        return Promise.resolve({ success: true, results: [{ stdout: 'Line 3' }] });
      });

      await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log',
        onData,
        duration: 10000
      });

      await vi.advanceTimersByTimeAsync(2000);
      expect(onData).toHaveBeenCalledWith(['Line 1', 'Line 2']);

      await vi.advanceTimersByTimeAsync(2000);
      expect(onData).toHaveBeenCalledWith(['Line 3']);

      expect(mockSSHExecutor.execute.mock.calls[1][0].command).toContain('tail -n +3');
    });

    test('should use default duration when not specified', async () => {
      mockSSHExecutor.execute = vi.fn().mockResolvedValue({
        success: true,
        results: [{ stdout: '' }]
      });

      const result = await collector.stream({
        target: 'host1',
        logPath: '/var/log/app.log'
      });

      expect(result.duration).toBe(60000);
    });
  });

  describe('parseLogLine - Nginx format', () => {
    test('should parse nginx log format', () => {
      const line = '[02/Feb/2026:02:45:30 +0000] GET /api/users 200';
      const parsed = collector.parseLogLine(line, 'host1');

      expect(parsed.timestamp).toBe('02/Feb/2026:02:45:30 +0000');
      expect(parsed.host).toBe('host1');
    });
  });

  describe('extractErrors - edge cases', () => {
    test('should handle logs with null level', () => {
      const logs = [
        { level: null, message: 'Some error message' },
        { level: 'INFO', message: 'normal log' }
      ];

      const errors = collector.extractErrors(logs);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('error');
    });

    test('should handle logs with null message', () => {
      const logs = [
        { level: 'ERROR', message: null },
        { level: 'INFO', message: 'normal log' }
      ];

      const errors = collector.extractErrors(logs);

      expect(errors).toHaveLength(1);
      expect(errors[0].level).toBe('ERROR');
    });
  });
});
