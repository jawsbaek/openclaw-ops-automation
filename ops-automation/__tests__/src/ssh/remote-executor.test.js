/**
 * Remote Executor Tests
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock dependencies
class MockConnectionPool {
  constructor() {
    this.getConnection = vi.fn();
    this.releaseConnection = vi.fn();
    this.closeAll = vi.fn();
  }
}

vi.mock('../../../src/ssh/connection-pool.js', () => ({
  default: MockConnectionPool
}));

const { default: RemoteExecutor } = await import('../../../src/ssh/remote-executor.js');

describe('RemoteExecutor', () => {
  let executor;
  let mockServersConfig;
  let mockWhitelistConfig;
  let _mockConnectionPool;

  beforeEach(() => {
    mockServersConfig = {
      servers: {
        web1: { host: '192.168.1.10', username: 'admin' },
        web2: { host: '192.168.1.11', username: 'admin' },
        db1: { host: '192.168.1.20', username: 'dbadmin' }
      },
      groups: {
        webservers: ['web1', 'web2'],
        databases: ['db1']
      }
    };

    mockWhitelistConfig = {
      allowedCommands: [
        '/bin/ls',
        '/bin/cat',
        '/usr/bin/systemctl status',
        { pattern: '^df -h.*', description: 'Check disk space' }
      ],
      blockedPatterns: ['rm -rf', 'dd if=', 'mkfs']
    };

    executor = new RemoteExecutor(mockServersConfig, mockWhitelistConfig);
    _mockConnectionPool = executor.connectionPool;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (executor) {
      executor.connectionPool.closeAll();
    }
  });

  describe('constructor', () => {
    test('should initialize with configs', () => {
      expect(executor.serversConfig).toEqual(mockServersConfig);
      expect(executor.whitelistConfig).toEqual(mockWhitelistConfig);
      expect(executor.connectionPool).toBeDefined();
      expect(executor.executionHistory).toEqual([]);
      expect(executor.pendingApprovals).toBeInstanceOf(Map);
    });
  });

  describe('resolveTargets()', () => {
    test('should resolve single server', () => {
      const hosts = executor.resolveTargets('web1');
      expect(hosts).toEqual(['web1']);
    });

    test('should resolve server group', () => {
      const hosts = executor.resolveTargets('webservers');
      expect(hosts).toEqual(['web1', 'web2']);
    });

    test('should resolve array of servers', () => {
      const hosts = executor.resolveTargets(['web1', 'db1']);
      expect(hosts).toEqual(['web1', 'db1']);
    });

    test('should return array with target for unknown target', () => {
      const hosts = executor.resolveTargets('unknown');
      expect(hosts).toEqual(['unknown']);
    });
  });

  describe('isCommandAllowed()', () => {
    test('should allow whitelisted command', () => {
      expect(executor.isCommandAllowed('/bin/ls -la', {})).toBe(true);
      expect(executor.isCommandAllowed('/bin/cat file.txt', {})).toBe(true);
    });

    test('should block non-whitelisted command', () => {
      expect(executor.isCommandAllowed('/usr/bin/wget http://example.com', {})).toBe(false);
    });

    test('should block dangerous commands', () => {
      expect(executor.isCommandAllowed('rm -rf /', {})).toBe(false);
      expect(executor.isCommandAllowed('dd if=/dev/zero of=/dev/sda', {})).toBe(false);
    });

    test('should still block dangerous command even with approval if not whitelisted', () => {
      // Dangerous commands need both approval AND whitelist entry
      expect(executor.isCommandAllowed('rm -rf /tmp/test', { requireApproval: true })).toBe(false);
    });

    test('should block sudo by default', () => {
      expect(executor.isCommandAllowed('sudo /bin/ls', {})).toBe(false);
    });
  });

  describe('getServerConfig()', () => {
    test('should return server configuration', () => {
      // Mock SSH config to avoid file read
      executor.serversConfig.ssh = {
        port: 22,
        user: 'admin',
        privateKey: 'mock-key'
      };

      const config = executor.getServerConfig('web1');
      expect(config).toHaveProperty('host', 'web1');
      expect(config).toHaveProperty('port', 22);
      expect(config).toHaveProperty('username', 'admin');
      expect(config).toHaveProperty('privateKey', 'mock-key');
    });
  });

  describe('simulateExecution()', () => {
    test('should return dry-run results', () => {
      const result = executor.simulateExecution('/bin/ls', ['web1', 'web2']);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].host).toBe('web1');
      expect(result.results[0].stdout).toBe('[DRY-RUN] 실행되지 않음');
      expect(result.summary).toEqual({
        total: 2,
        succeeded: 2,
        failed: 0
      });
    });
  });

  describe('formatResults()', () => {
    test('should format execution results', () => {
      const rawResults = [
        { host: 'web1', success: true, stdout: 'output1' },
        { host: 'web2', success: false, error: 'connection failed' }
      ];

      const formatted = executor.formatResults(rawResults);

      expect(formatted.success).toBe(false); // every() returns false if any failed
      expect(formatted.summary.total).toBe(2);
      expect(formatted.summary.succeeded).toBe(1);
      expect(formatted.summary.failed).toBe(1);
      expect(formatted.results).toEqual(rawResults);
    });

    test('should mark overall success as false if all failed', () => {
      const rawResults = [
        { host: 'web1', success: false, error: 'error1' },
        { host: 'web2', success: false, error: 'error2' }
      ];

      const formatted = executor.formatResults(rawResults);

      expect(formatted.success).toBe(false);
      expect(formatted.summary.succeeded).toBe(0);
      expect(formatted.summary.failed).toBe(2);
    });
  });

  describe('recordExecution()', () => {
    test('should record execution in history', () => {
      const command = '/bin/ls';
      const hosts = ['web1', 'web2'];
      const results = [{ host: 'web1', success: true }];

      executor.recordExecution(command, hosts, results);

      expect(executor.executionHistory).toHaveLength(1);
      expect(executor.executionHistory[0].command).toBe(command);
      expect(executor.executionHistory[0].hosts).toEqual(hosts);
      expect(executor.executionHistory[0].timestamp).toBeTruthy();
    });

    test('should limit history to 1000 entries', () => {
      for (let i = 0; i < 1100; i++) {
        executor.recordExecution(`command${i}`, ['web1'], []);
      }

      expect(executor.executionHistory.length).toBe(1000);
    });
  });

  describe('getExecutionHistory()', () => {
    test('should return recent executions', () => {
      executor.recordExecution('cmd1', ['web1'], []);
      executor.recordExecution('cmd2', ['web2'], []);

      const history = executor.getExecutionHistory(10);

      expect(history).toHaveLength(2);
      expect(history[0].command).toBe('cmd2'); // Most recent first
      expect(history[1].command).toBe('cmd1');
    });

    test('should limit returned history', () => {
      for (let i = 0; i < 20; i++) {
        executor.recordExecution(`cmd${i}`, ['web1'], []);
      }

      const history = executor.getExecutionHistory(5);
      expect(history).toHaveLength(5);
    });
  });

  describe('getStats()', () => {
    test('should return execution statistics', () => {
      executor.recordExecution('cmd1', ['web1'], [{ success: true }]);
      executor.recordExecution('cmd2', ['web2'], [{ success: false }]);

      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(1);
    });

    test('should return zero stats for new executor', () => {
      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
    });
  });
});
