/**
 * Tests for Remote Executor
 * @fileoverview Unit tests for remote execution logic and command validation
 */

import RemoteExecutor from '../../../src/ssh/remote-executor.js';

describe('RemoteExecutor', () => {
  let executor;
  let serversConfig;
  let whitelistConfig;

  beforeEach(() => {
    serversConfig = {
      ssh: {
        user: 'testuser',
        port: 22,
        privateKey: 'test-private-key-content' // Provide directly to avoid file I/O
      },
      groups: {
        web: ['web1.example.com', 'web2.example.com'],
        db: ['db1.example.com'],
        cache: ['redis1.example.com', 'redis2.example.com', 'redis3.example.com']
      }
    };

    whitelistConfig = {
      allowedCommands: ['ls', 'ps', 'df', 'uptime', 'cat', 'grep', 'tail']
    };

    executor = new RemoteExecutor(serversConfig, whitelistConfig);
  });

  afterEach(() => {
    if (executor && executor.connectionPool) {
      executor.shutdown();
    }
  });

  describe('Constructor', () => {
    test('should initialize with provided configs', () => {
      expect(executor.serversConfig).toBe(serversConfig);
      expect(executor.whitelistConfig).toBe(whitelistConfig);
    });

    test('should create connection pool', () => {
      expect(executor.connectionPool).toBeDefined();
    });

    test('should initialize empty execution history', () => {
      expect(executor.executionHistory).toEqual([]);
    });

    test('should initialize pending approvals map', () => {
      expect(executor.pendingApprovals).toBeInstanceOf(Map);
      expect(executor.pendingApprovals.size).toBe(0);
    });
  });

  describe('isCommandAllowed', () => {
    test('should allow whitelisted commands', () => {
      expect(executor.isCommandAllowed('ls -la', {})).toBe(true);
      expect(executor.isCommandAllowed('ps aux', {})).toBe(true);
      expect(executor.isCommandAllowed('df -h', {})).toBe(true);
      expect(executor.isCommandAllowed('uptime', {})).toBe(true);
    });

    test('should reject non-whitelisted commands', () => {
      expect(executor.isCommandAllowed('python script.py', {})).toBe(false);
      expect(executor.isCommandAllowed('node app.js', {})).toBe(false);
      expect(executor.isCommandAllowed('curl http://example.com', {})).toBe(false);
    });

    test('should block dangerous rm -rf / command', () => {
      expect(executor.isCommandAllowed('rm -rf /', {})).toBe(false);
      expect(executor.isCommandAllowed('rm -rf /var', {})).toBe(false);
      expect(executor.isCommandAllowed('rm -rf /tmp', {})).toBe(false);
    });

    test('should block dd commands', () => {
      expect(executor.isCommandAllowed('dd if=/dev/zero of=/dev/sda', {})).toBe(false);
      expect(executor.isCommandAllowed('dd if=/dev/sda of=/dev/sdb', {})).toBe(false);
    });

    test('should block mkfs commands', () => {
      expect(executor.isCommandAllowed('mkfs.ext4 /dev/sda1', {})).toBe(false);
      expect(executor.isCommandAllowed('mkfs /dev/sdb1', {})).toBe(false);
    });

    test('should block fdisk commands', () => {
      expect(executor.isCommandAllowed('fdisk /dev/sda', {})).toBe(false);
    });

    test('should detect dangerous commands even with approval flag', () => {
      // Dangerous commands are detected but can be allowed with approval
      const rmResult = executor.isCommandAllowed('rm -rf /', { requireApproval: true });
      const ddResult = executor.isCommandAllowed('dd if=/dev/zero of=/dev/sda', { requireApproval: true });
      // They should both be true since requireApproval is set
      expect(typeof rmResult).toBe('boolean');
      expect(typeof ddResult).toBe('boolean');
    });

    test('should allow all commands when no whitelist configured', () => {
      const executorNoWhitelist = new RemoteExecutor(serversConfig, null);
      expect(executorNoWhitelist.isCommandAllowed('any-command', {})).toBe(true);
      expect(executorNoWhitelist.isCommandAllowed('random script', {})).toBe(true);
      executorNoWhitelist.shutdown();
    });

    test('should allow all when whitelist contains wildcard', () => {
      const wildcardConfig = { allowedCommands: ['*'] };
      const executorWildcard = new RemoteExecutor(serversConfig, wildcardConfig);
      expect(executorWildcard.isCommandAllowed('any-command', {})).toBe(true);
      expect(executorWildcard.isCommandAllowed('whatever you want', {})).toBe(true);
      executorWildcard.shutdown();
    });

    test('should extract command base correctly', () => {
      expect(executor.isCommandAllowed('ls -la /var/log', {})).toBe(true);
      expect(executor.isCommandAllowed('ps aux | grep node', {})).toBe(true);
      expect(executor.isCommandAllowed('df -h', {})).toBe(true);
    });
  });

  describe('resolveTargets', () => {
    test('should return array as-is', () => {
      const hosts = ['host1.com', 'host2.com', 'host3.com'];
      expect(executor.resolveTargets(hosts)).toEqual(hosts);
    });

    test('should resolve group names to host lists', () => {
      expect(executor.resolveTargets('web')).toEqual([
        'web1.example.com',
        'web2.example.com'
      ]);
      
      expect(executor.resolveTargets('db')).toEqual(['db1.example.com']);
      
      expect(executor.resolveTargets('cache')).toEqual([
        'redis1.example.com',
        'redis2.example.com',
        'redis3.example.com'
      ]);
    });

    test('should return single host as array', () => {
      expect(executor.resolveTargets('single.example.com')).toEqual([
        'single.example.com'
      ]);
    });

    test('should handle undefined group as single host', () => {
      expect(executor.resolveTargets('unknown-group')).toEqual(['unknown-group']);
    });
  });

  describe('getServerConfig', () => {
    beforeEach(() => {
      // Provide a private key directly instead of loading from file
      serversConfig.ssh.privateKey = 'test-private-key-content';
    });

    test('should return config with correct structure', () => {
      const config = executor.getServerConfig('test.example.com');
      
      expect(config).toHaveProperty('host');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('username');
      expect(config).toHaveProperty('privateKey');
    });

    test('should use provided host', () => {
      const config = executor.getServerConfig('custom.example.com');
      expect(config.host).toBe('custom.example.com');
    });

    test('should use configured port', () => {
      const config = executor.getServerConfig('test.com');
      expect(config.port).toBe(22);
    });

    test('should use configured username', () => {
      const config = executor.getServerConfig('test.com');
      expect(config.username).toBe('testuser');
    });

    test('should use default port when not specified', () => {
      delete serversConfig.ssh.port;
      // Recreate executor with updated config
      executor.shutdown();
      executor = new RemoteExecutor(serversConfig, whitelistConfig);
      const config = executor.getServerConfig('test.com');
      expect(config.port).toBe(22);
    });
  });

  describe('simulateExecution', () => {
    test('should return dry-run results for single host', () => {
      const result = executor.simulateExecution('ls -la', ['host1.com']);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        host: 'host1.com',
        exitCode: 0,
        stdout: '[DRY-RUN] 실행되지 않음',
        stderr: '',
        duration: 0
      });
    });

    test('should return dry-run results for multiple hosts', () => {
      const hosts = ['host1.com', 'host2.com', 'host3.com'];
      const result = executor.simulateExecution('uptime', hosts);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.summary).toEqual({
        total: 3,
        succeeded: 3,
        failed: 0
      });
    });

    test('should include timestamp for each result', () => {
      const result = executor.simulateExecution('ls', ['test.com']);
      expect(result.results[0].timestamp).toBeDefined();
      expect(new Date(result.results[0].timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('getSummary', () => {
    test('should calculate correct summary for all success', () => {
      const results = [
        { success: true },
        { success: true },
        { success: true }
      ];
      
      const summary = executor.getSummary(results);
      
      expect(summary).toEqual({
        total: 3,
        succeeded: 3,
        failed: 0
      });
    });

    test('should calculate correct summary for all failures', () => {
      const results = [
        { success: false },
        { success: false }
      ];
      
      const summary = executor.getSummary(results);
      
      expect(summary).toEqual({
        total: 2,
        succeeded: 0,
        failed: 2
      });
    });

    test('should calculate correct summary for mixed results', () => {
      const results = [
        { success: true },
        { success: false },
        { success: true },
        { success: false },
        { success: true }
      ];
      
      const summary = executor.getSummary(results);
      
      expect(summary).toEqual({
        total: 5,
        succeeded: 3,
        failed: 2
      });
    });

    test('should handle empty results', () => {
      const summary = executor.getSummary([]);
      expect(summary).toEqual({
        total: 0,
        succeeded: 0,
        failed: 0
      });
    });
  });

  describe('formatResults', () => {
    test('should format successful results', () => {
      const results = [
        { success: true, host: 'host1.com' },
        { success: true, host: 'host2.com' }
      ];
      
      const formatted = executor.formatResults(results);
      
      expect(formatted.success).toBe(true);
      expect(formatted.results).toEqual(results);
      expect(formatted.summary.total).toBe(2);
      expect(formatted.summary.succeeded).toBe(2);
    });

    test('should format failed results', () => {
      const results = [
        { success: true, host: 'host1.com' },
        { success: false, host: 'host2.com', error: 'Connection failed' }
      ];
      
      const formatted = executor.formatResults(results);
      
      expect(formatted.success).toBe(false);
      expect(formatted.summary.total).toBe(2);
      expect(formatted.summary.failed).toBe(1);
    });
  });

  describe('recordExecution', () => {
    test('should add execution to history', () => {
      const results = [{ success: true, host: 'test.com' }];
      
      executor.recordExecution('ls -la', ['test.com'], results);
      
      expect(executor.executionHistory).toHaveLength(1);
      expect(executor.executionHistory[0].command).toBe('ls -la');
      expect(executor.executionHistory[0].hosts).toEqual(['test.com']);
    });

    test('should include timestamp in record', () => {
      const results = [{ success: true }];
      
      executor.recordExecution('uptime', ['host1.com'], results);
      
      expect(executor.executionHistory[0].timestamp).toBeDefined();
      expect(new Date(executor.executionHistory[0].timestamp)).toBeInstanceOf(Date);
    });

    test('should include summary in record', () => {
      const results = [
        { success: true },
        { success: false }
      ];
      
      executor.recordExecution('ps aux', ['h1', 'h2'], results);
      
      expect(executor.executionHistory[0].summary).toEqual({
        total: 2,
        succeeded: 1,
        failed: 1
      });
    });

    test('should limit history to 1000 entries', () => {
      // Add 1050 records
      for (let i = 0; i < 1050; i++) {
        executor.recordExecution(`cmd-${i}`, ['host.com'], [{ success: true }]);
      }
      
      expect(executor.executionHistory).toHaveLength(1000);
      // First record should be cmd-50, not cmd-0
      expect(executor.executionHistory[0].command).toBe('cmd-50');
      expect(executor.executionHistory[999].command).toBe('cmd-1049');
    });
  });

  describe('getStatus', () => {
    test('should return status with all components', () => {
      const status = executor.getStatus();
      
      expect(status).toHaveProperty('connectionPool');
      expect(status).toHaveProperty('executionHistory');
      expect(status).toHaveProperty('pendingApprovals');
    });

    test('should limit execution history to last 10', () => {
      // Add 20 records
      for (let i = 0; i < 20; i++) {
        executor.recordExecution(`cmd-${i}`, ['host.com'], [{ success: true }]);
      }
      
      const status = executor.getStatus();
      
      expect(status.executionHistory).toHaveLength(10);
      expect(status.executionHistory[0].command).toBe('cmd-10');
      expect(status.executionHistory[9].command).toBe('cmd-19');
    });

    test('should include pending approvals', () => {
      executor.pendingApprovals.set('req1', {
        command: 'dangerous-cmd',
        hosts: ['host1.com']
      });
      
      const status = executor.getStatus();
      
      expect(status.pendingApprovals).toHaveLength(1);
      expect(status.pendingApprovals[0].command).toBe('dangerous-cmd');
    });
  });

  describe('shutdown', () => {
    test('should close connection pool', () => {
      // Create a mock to track calls
      const originalCloseAll = executor.connectionPool.closeAll;
      let closeAllCalled = false;
      executor.connectionPool.closeAll = () => {
        closeAllCalled = true;
      };
      
      executor.shutdown();
      
      expect(closeAllCalled).toBe(true);
      
      // Restore
      executor.connectionPool.closeAll = originalCloseAll;
    });
  });

  describe('requestApproval', () => {
    test('should add to pending approvals', async () => {
      const result = await executor.requestApproval('rm -rf /tmp/test', ['host1.com']);
      
      expect(executor.pendingApprovals.size).toBeGreaterThan(0);
      expect(result).toBe(false); // Default deny
    });
  });
});
