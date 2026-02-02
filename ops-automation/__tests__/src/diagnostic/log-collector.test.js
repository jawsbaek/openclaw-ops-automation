/**
 * Tests for Log Collector
 * @fileoverview Unit tests for log collection and parsing logic
 */

import LogCollector from '../../../src/diagnostic/log-collector.js';

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
      const commands = collector.buildLogCommands(null, timeRange, [], 1000000);

      expect(commands.collect).toContain('journalctl');
      expect(commands.collect).toContain('--since "1 hour ago"');
      expect(commands.collect).toContain('--until "10 minutes ago"');
    });

    test('should build command for file-based logs', () => {
      const commands = collector.buildLogCommands('/var/log/app.log', null, [], 100 * 1024 * 1024);

      expect(commands.collect).toContain('tail -n');
      expect(commands.collect).toContain('/var/log/app.log');
    });

    test('should add filters to command', () => {
      const filters = ['ERROR', 'WARN'];
      const commands = collector.buildLogCommands('/var/log/app.log', null, filters, 1000000);

      expect(commands.collect).toContain('grep -E');
      expect(commands.collect).toContain('ERROR\\|WARN');
    });

    test('should include count command', () => {
      const commands = collector.buildLogCommands('/var/log/app.log', null, [], 1000000);

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
      const command = collector.buildGrepCommand('/var/log/app.log', 'ERROR', null, 3);

      expect(command).toContain('grep');
      expect(command).toContain('-iA3');
      expect(command).toContain('-B3');
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
  });
});
