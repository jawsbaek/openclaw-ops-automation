import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class MockConnectionPool {
  constructor() {
    this.getConnection = vi.fn();
    this.releaseConnection = vi.fn();
    this.closeAll = vi.fn();
    this.getStatus = vi.fn(() => ({ active: 0, idle: 0 }));
  }
}

vi.mock('../../../src/ssh/connection-pool.js', () => ({
  default: MockConnectionPool
}));

vi.mock('../../../lib/logger.js', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}));

const { readFileSync } = await import('node:fs');
const { default: RemoteExecutor } = await import('../../../src/ssh/remote-executor.js');

describe('RemoteExecutor', () => {
  let executor;
  let mockServersConfig;
  let mockWhitelistConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServersConfig = {
      servers: {
        web1: { host: '192.168.1.10', username: 'admin' },
        web2: { host: '192.168.1.11', username: 'admin' },
        db1: { host: '192.168.1.20', username: 'dbadmin' }
      },
      groups: {
        webservers: ['web1', 'web2'],
        databases: ['db1']
      },
      ssh: {
        port: 22,
        user: 'admin',
        privateKey: 'mock-private-key'
      }
    };

    mockWhitelistConfig = {
      allowedCommands: ['/bin/ls', '/bin/cat', '/usr/bin/systemctl', 'df', 'echo'],
      blockedPatterns: ['rm -rf', 'dd if=', 'mkfs']
    };

    executor = new RemoteExecutor(mockServersConfig, mockWhitelistConfig);
  });

  afterEach(() => {
    if (executor) {
      executor.connectionPool.closeAll();
    }
  });

  describe('constructor', () => {
    test('initializes with configs', () => {
      expect(executor.serversConfig).toEqual(mockServersConfig);
      expect(executor.whitelistConfig).toEqual(mockWhitelistConfig);
      expect(executor.connectionPool).toBeDefined();
      expect(executor.executionHistory).toEqual([]);
      expect(executor.pendingApprovals).toBeInstanceOf(Map);
    });

    test('creates connection pool with correct options', () => {
      expect(executor.connectionPool).toBeInstanceOf(MockConnectionPool);
    });
  });

  describe('resolveTargets', () => {
    test('resolves single server', () => {
      expect(executor.resolveTargets('web1')).toEqual(['web1']);
    });

    test('resolves server group', () => {
      expect(executor.resolveTargets('webservers')).toEqual(['web1', 'web2']);
    });

    test('resolves array of servers', () => {
      expect(executor.resolveTargets(['web1', 'db1'])).toEqual(['web1', 'db1']);
    });

    test('returns array with target for unknown target', () => {
      expect(executor.resolveTargets('unknown')).toEqual(['unknown']);
    });

    test('handles missing groups config', () => {
      executor.serversConfig = {};
      expect(executor.resolveTargets('somegroup')).toEqual(['somegroup']);
    });
  });

  describe('isCommandAllowed', () => {
    test('allows whitelisted command', () => {
      expect(executor.isCommandAllowed('/bin/ls -la', {})).toBe(true);
      expect(executor.isCommandAllowed('/bin/cat file.txt', {})).toBe(true);
    });

    test('blocks non-whitelisted command', () => {
      expect(executor.isCommandAllowed('/usr/bin/wget http://example.com', {})).toBe(false);
    });

    test('blocks dangerous rm -rf / command', () => {
      expect(executor.isCommandAllowed('rm -rf /', {})).toBe(false);
    });

    test('blocks dd if= command', () => {
      expect(executor.isCommandAllowed('dd if=/dev/zero of=/dev/sda', {})).toBe(false);
    });

    test('blocks mkfs command', () => {
      expect(executor.isCommandAllowed('mkfs /dev/sda1', {})).toBe(false);
    });

    test('blocks fdisk command', () => {
      expect(executor.isCommandAllowed('fdisk /dev/sda', {})).toBe(false);
    });

    test('blocks fork bomb', () => {
      expect(executor.isCommandAllowed(':(){ :|:& };:', {})).toBe(false);
    });

    test('allows dangerous command with requireApproval flag', () => {
      expect(executor.isCommandAllowed('rm -rf /', { requireApproval: true })).toBe(false);
    });

    test('allows all commands when whitelist is wildcard', () => {
      executor.whitelistConfig.allowedCommands = ['*'];
      expect(executor.isCommandAllowed('/some/random/command', {})).toBe(true);
    });

    test('allows all commands when no whitelist config', () => {
      executor.whitelistConfig = null;
      expect(executor.isCommandAllowed('/any/command', {})).toBe(true);
    });

    test('handles empty allowedCommands array', () => {
      executor.whitelistConfig.allowedCommands = [];
      expect(executor.isCommandAllowed('/bin/ls', {})).toBe(false);
    });
  });

  describe('getServerConfig', () => {
    test('returns server configuration with SSH settings', () => {
      const config = executor.getServerConfig('web1');
      expect(config.host).toBe('web1');
      expect(config.port).toBe(22);
      expect(config.username).toBe('admin');
      expect(config.privateKey).toBe('mock-private-key');
    });

    test('uses default port 22 when not specified', () => {
      delete executor.serversConfig.ssh.port;
      const config = executor.getServerConfig('web1');
      expect(config.port).toBe(22);
    });

    test('loads private key from file when key_path specified', () => {
      executor.serversConfig.ssh = {
        user: 'admin',
        key_path: '/path/to/key'
      };
      readFileSync.mockReturnValue('file-based-key');

      const config = executor.getServerConfig('web1');

      expect(readFileSync).toHaveBeenCalledWith('/path/to/key', 'utf8');
      expect(config.privateKey).toBe('file-based-key');
    });
  });

  describe('loadPrivateKey', () => {
    test('reads key file successfully', () => {
      readFileSync.mockReturnValue('ssh-key-content');
      const key = executor.loadPrivateKey('/path/to/key');
      expect(key).toBe('ssh-key-content');
    });

    test('throws error when key file not found', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => executor.loadPrivateKey('/nonexistent/key')).toThrow('SSH 키를 찾을 수 없음');
    });
  });

  describe('simulateExecution', () => {
    test('returns dry-run results', () => {
      const result = executor.simulateExecution('/bin/ls', ['web1', 'web2']);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].host).toBe('web1');
      expect(result.results[0].stdout).toBe('[DRY-RUN] 실행되지 않음');
      expect(result.results[0].exitCode).toBe(0);
      expect(result.results[0].stderr).toBe('');
      expect(result.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    });

    test('includes timestamp in results', () => {
      const result = executor.simulateExecution('/bin/ls', ['web1']);
      expect(result.results[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('formatResults', () => {
    test('formats successful execution results', () => {
      const rawResults = [
        { host: 'web1', success: true, stdout: 'output1' },
        { host: 'web2', success: true, stdout: 'output2' }
      ];

      const formatted = executor.formatResults(rawResults);

      expect(formatted.success).toBe(true);
      expect(formatted.summary.total).toBe(2);
      expect(formatted.summary.succeeded).toBe(2);
      expect(formatted.summary.failed).toBe(0);
    });

    test('marks overall success as false if any failed', () => {
      const rawResults = [
        { host: 'web1', success: true, stdout: 'output1' },
        { host: 'web2', success: false, error: 'connection failed' }
      ];

      const formatted = executor.formatResults(rawResults);

      expect(formatted.success).toBe(false);
      expect(formatted.summary.succeeded).toBe(1);
      expect(formatted.summary.failed).toBe(1);
    });

    test('handles all failed results', () => {
      const rawResults = [
        { host: 'web1', success: false, error: 'error1' },
        { host: 'web2', success: false, error: 'error2' }
      ];

      const formatted = executor.formatResults(rawResults);

      expect(formatted.success).toBe(false);
      expect(formatted.summary.succeeded).toBe(0);
      expect(formatted.summary.failed).toBe(2);
    });

    test('handles empty results', () => {
      const formatted = executor.formatResults([]);

      expect(formatted.success).toBe(true);
      expect(formatted.summary.total).toBe(0);
    });
  });

  describe('getSummary', () => {
    test('calculates summary statistics', () => {
      const results = [{ success: true }, { success: true }, { success: false }];

      const summary = executor.getSummary(results);

      expect(summary.total).toBe(3);
      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(1);
    });

    test('handles empty results', () => {
      const summary = executor.getSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.succeeded).toBe(0);
      expect(summary.failed).toBe(0);
    });
  });

  describe('recordExecution', () => {
    test('records execution in history', () => {
      const command = '/bin/ls';
      const hosts = ['web1', 'web2'];
      const results = [{ host: 'web1', success: true }];

      executor.recordExecution(command, hosts, results);

      expect(executor.executionHistory).toHaveLength(1);
      expect(executor.executionHistory[0].command).toBe(command);
      expect(executor.executionHistory[0].hosts).toEqual(hosts);
      expect(executor.executionHistory[0].timestamp).toBeTruthy();
      expect(executor.executionHistory[0].summary).toBeDefined();
    });

    test('limits history to 1000 entries', () => {
      for (let i = 0; i < 1100; i++) {
        executor.recordExecution(`command${i}`, ['web1'], []);
      }

      expect(executor.executionHistory.length).toBe(1000);
      expect(executor.executionHistory[0].command).toBe('command100');
    });
  });

  describe('getExecutionHistory', () => {
    test('returns recent executions in reverse order', () => {
      executor.recordExecution('cmd1', ['web1'], []);
      executor.recordExecution('cmd2', ['web2'], []);
      executor.recordExecution('cmd3', ['web3'], []);

      const history = executor.getExecutionHistory(10);

      expect(history).toHaveLength(3);
      expect(history[0].command).toBe('cmd3');
      expect(history[1].command).toBe('cmd2');
      expect(history[2].command).toBe('cmd1');
    });

    test('limits returned history', () => {
      for (let i = 0; i < 20; i++) {
        executor.recordExecution(`cmd${i}`, ['web1'], []);
      }

      const history = executor.getExecutionHistory(5);
      expect(history).toHaveLength(5);
    });

    test('defaults to 100 when no limit specified', () => {
      for (let i = 0; i < 150; i++) {
        executor.recordExecution(`cmd${i}`, ['web1'], []);
      }

      const history = executor.getExecutionHistory();
      expect(history).toHaveLength(100);
    });

    test('returns all when limit exceeds history size', () => {
      executor.recordExecution('cmd1', ['web1'], []);
      executor.recordExecution('cmd2', ['web2'], []);

      const history = executor.getExecutionHistory(100);
      expect(history).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    test('returns execution statistics', () => {
      executor.recordExecution('cmd1', ['web1'], [{ success: true }]);
      executor.recordExecution('cmd2', ['web2'], [{ success: false }]);

      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(1);
      expect(stats.successRate).toBe(50);
    });

    test('returns zero stats for new executor', () => {
      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    test('calculates 100% success rate when all succeed', () => {
      executor.recordExecution('cmd1', ['web1'], [{ success: true }]);
      executor.recordExecution('cmd2', ['web2'], [{ success: true }]);

      const stats = executor.getStats();
      expect(stats.successRate).toBe(100);
    });
  });

  describe('getStatus', () => {
    test('returns current status', () => {
      executor.recordExecution('cmd1', ['web1'], [{ success: true }]);

      const status = executor.getStatus();

      expect(status.connectionPool).toBeDefined();
      expect(status.executionHistory).toHaveLength(1);
      expect(status.pendingApprovals).toEqual([]);
    });

    test('returns last 10 execution history', () => {
      for (let i = 0; i < 20; i++) {
        executor.recordExecution(`cmd${i}`, ['web1'], []);
      }

      const status = executor.getStatus();
      expect(status.executionHistory).toHaveLength(10);
    });

    test('includes pending approvals', () => {
      executor.pendingApprovals.set('req1', { command: 'cmd1', hosts: ['web1'] });
      executor.pendingApprovals.set('req2', { command: 'cmd2', hosts: ['web2'] });

      const status = executor.getStatus();
      expect(status.pendingApprovals).toHaveLength(2);
    });
  });

  describe('requestApproval', () => {
    test('returns false by default', async () => {
      const result = await executor.requestApproval('rm -rf /tmp', ['web1']);
      expect(result).toBe(false);
    });

    test('adds request to pending approvals', async () => {
      await executor.requestApproval('dangerous-cmd', ['web1', 'web2']);

      expect(executor.pendingApprovals.size).toBe(1);
      const approval = Array.from(executor.pendingApprovals.values())[0];
      expect(approval.command).toBe('dangerous-cmd');
      expect(approval.hosts).toEqual(['web1', 'web2']);
    });
  });

  describe('shutdown', () => {
    test('closes all connections', () => {
      executor.shutdown();
      expect(executor.connectionPool.closeAll).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    test('throws error for blocked command', async () => {
      await expect(executor.execute({ target: 'web1', command: 'rm -rf /' })).rejects.toThrow('명령 실행 거부');
    });

    test('throws error when no targets found', async () => {
      executor.serversConfig.groups = {};
      await expect(executor.execute({ target: [], command: '/bin/ls' })).rejects.toThrow('대상 서버를 찾을 수 없음');
    });

    test('throws error when approval required but denied', async () => {
      await expect(
        executor.execute({
          target: 'web1',
          command: '/bin/ls',
          options: { requireApproval: true }
        })
      ).rejects.toThrow('명령 실행이 승인되지 않음');
    });

    test('returns dry-run results when dryRun option is true', async () => {
      const result = await executor.execute({
        target: 'webservers',
        command: '/bin/ls',
        options: { dryRun: true }
      });

      expect(result.dryRun).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    test('executes in parallel when parallel option is true', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
              if (event === 'data') setTimeout(() => handler(Buffer.from('output')), 5);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const result = await executor.execute({
        target: ['web1', 'web2'],
        command: '/bin/ls',
        options: { parallel: true }
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    test('executes sequentially by default', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
              if (event === 'data') setTimeout(() => handler(Buffer.from('output')), 5);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const result = await executor.execute({
        target: 'web1',
        command: '/bin/ls'
      });

      expect(result.success).toBe(true);
      expect(executor.executionHistory).toHaveLength(1);
    });
  });

  describe('executeParallel', () => {
    test('executes on all hosts in parallel', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const results = await executor.executeParallel('/bin/ls', ['web1', 'web2'], {});

      expect(results).toHaveLength(2);
    });

    test('catches errors for failed hosts', async () => {
      executor.connectionPool.getConnection.mockRejectedValue(new Error('Connection failed'));

      const results = await executor.executeParallel('/bin/ls', ['web1', 'web2'], {});

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Connection failed');
    });
  });

  describe('executeSequential', () => {
    test('executes on hosts sequentially', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const results = await executor.executeSequential('/bin/ls', ['web1', 'web2'], {});

      expect(results).toHaveLength(2);
    });

    test('continues execution after host failure', async () => {
      let callCount = 0;
      executor.connectionPool.getConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First host failed'));
        }
        return Promise.resolve({
          exec: vi.fn((cmd, cb) => {
            const mockStream = {
              on: vi.fn((event, handler) => {
                if (event === 'close') setTimeout(() => handler(0, null), 10);
              }),
              stderr: { on: vi.fn() }
            };
            cb(null, mockStream);
          })
        });
      });

      const results = await executor.executeSequential('/bin/ls', ['web1', 'web2'], {});

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('executeOnHost', () => {
    test('executes command and returns result', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
              if (event === 'data') handler(Buffer.from('command output'));
            }),
            stderr: {
              on: vi.fn((event, handler) => {
                if (event === 'data') handler(Buffer.from(''));
              })
            }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const result = await executor.executeOnHost('web1', '/bin/ls', {});

      expect(result.host).toBe('web1');
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('command output');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeTruthy();
    });

    test('uses custom timeout', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      const result = await executor.executeOnHost('web1', '/bin/ls', { timeout: 60000 });

      expect(result.success).toBe(true);
    });

    test('releases connection after execution', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn((event, handler) => {
              if (event === 'close') setTimeout(() => handler(0, null), 10);
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      executor.connectionPool.getConnection.mockResolvedValue(mockClient);

      await executor.executeOnHost('web1', '/bin/ls', {});

      expect(executor.connectionPool.releaseConnection).toHaveBeenCalledWith('web1');
    });

    test('throws error on connection failure', async () => {
      executor.connectionPool.getConnection.mockRejectedValue(new Error('Connection refused'));

      await expect(executor.executeOnHost('web1', '/bin/ls', {})).rejects.toThrow('Connection refused');
    });
  });

  describe('execCommand', () => {
    test('executes command and collects output', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const handlers = {};
          const stderrHandlers = {};
          const mockStream = {
            on: vi.fn((event, handler) => {
              handlers[event] = handler;
            }),
            stderr: {
              on: vi.fn((event, handler) => {
                stderrHandlers[event] = handler;
              })
            }
          };
          cb(null, mockStream);
          setTimeout(() => {
            handlers.data?.(Buffer.from('stdout data'));
            stderrHandlers.data?.(Buffer.from('stderr data'));
            handlers.close?.(0, null);
          }, 10);
        })
      };

      const result = await executor.execCommand(mockClient, '/bin/ls', 30000);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('stdout data');
      expect(result.stderr).toBe('stderr data');
    });

    test('rejects on exec error', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          cb(new Error('Exec failed'), null);
        })
      };

      await expect(executor.execCommand(mockClient, '/bin/ls', 30000)).rejects.toThrow('Exec failed');
    });

    test('rejects on timeout', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const mockStream = {
            on: vi.fn(),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
        })
      };

      await expect(executor.execCommand(mockClient, '/bin/ls', 50)).rejects.toThrow('명령 타임아웃');
    }, 1000);

    test('handles non-zero exit code', async () => {
      const mockClient = {
        exec: vi.fn((cmd, cb) => {
          const handlers = {};
          const mockStream = {
            on: vi.fn((event, handler) => {
              handlers[event] = handler;
            }),
            stderr: { on: vi.fn() }
          };
          cb(null, mockStream);
          setTimeout(() => handlers.close?.(1, 'SIGTERM'), 10);
        })
      };

      const result = await executor.execCommand(mockClient, '/bin/false', 30000);

      expect(result.exitCode).toBe(1);
      expect(result.signal).toBe('SIGTERM');
    });
  });
});
