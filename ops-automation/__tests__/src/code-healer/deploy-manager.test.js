import { jest } from '@jest/globals';

// Mock logger before importing DeployManager
jest.unstable_mockModule('../../../lib/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const { default: DeployManager } = await import('../../../src/code-healer/deploy-manager.js');

describe('DeployManager', () => {
  let deployManager;
  let mockSSHExecutor;

  beforeEach(() => {
    mockSSHExecutor = {
      execute: () =>
        Promise.resolve({
          success: true,
          results: [{ stdout: '', stderr: '', exitCode: 0, success: true }]
        })
    };
    deployManager = new DeployManager(mockSSHExecutor);
  });

  describe('Constructor', () => {
    test('should initialize with SSH executor', () => {
      expect(deployManager.sshExecutor).toBe(mockSSHExecutor);
    });

    test('should initialize with default config when no config provided', () => {
      expect(deployManager.config).toBeDefined();
      expect(deployManager.config.canary).toBeDefined();
      expect(deployManager.config.thresholds).toBeDefined();
    });

    test('should initialize with custom config when provided', () => {
      const customConfig = { canary: { stages: [] }, thresholds: { maxErrorRate: 5 } };
      const manager = new DeployManager(mockSSHExecutor, customConfig);
      expect(manager.config.thresholds.maxErrorRate).toBe(5);
    });

    test('should initialize empty deployments map', () => {
      expect(deployManager.deployments).toBeInstanceOf(Map);
      expect(deployManager.deployments.size).toBe(0);
    });

    test('should initialize empty activeDeployments set', () => {
      expect(deployManager.activeDeployments).toBeInstanceOf(Set);
      expect(deployManager.activeDeployments.size).toBe(0);
    });
  });

  describe('getDefaultConfig', () => {
    test('should return canary stages configuration', () => {
      const config = deployManager.getDefaultConfig();

      expect(config.canary.stages).toBeInstanceOf(Array);
      expect(config.canary.stages.length).toBeGreaterThan(0);
      expect(config.canary.stages[0]).toHaveProperty('name');
      expect(config.canary.stages[0]).toHaveProperty('percentage');
    });

    test('should return stages with server configurations', () => {
      const config = deployManager.getDefaultConfig();

      expect(config.stages).toBeDefined();
      expect(config.stages.test).toBeDefined();
      expect(config.stages.staging).toBeDefined();
      expect(config.stages.production).toBeDefined();
    });

    test('should return health check configuration', () => {
      const config = deployManager.getDefaultConfig();

      expect(config.healthCheck).toBeDefined();
      expect(config.healthCheck.command).toBeDefined();
      expect(config.healthCheck.attempts).toBe(3);
    });

    test('should return monitoring configuration', () => {
      const config = deployManager.getDefaultConfig();

      expect(config.monitoring).toBeDefined();
      expect(config.monitoring.duration).toBe(60000);
    });

    test('should return threshold configuration', () => {
      const config = deployManager.getDefaultConfig();

      expect(config.thresholds).toBeDefined();
      expect(config.thresholds.maxErrorRate).toBe(1.0);
      expect(config.thresholds.maxResponseTime).toBe(500);
      expect(config.thresholds.maxCpu).toBe(80);
      expect(config.thresholds.maxMemory).toBe(85);
    });
  });

  describe('generateDeploymentId', () => {
    test('should generate unique deployment IDs', () => {
      const id1 = deployManager.generateDeploymentId();
      const id2 = deployManager.generateDeploymentId();

      expect(id1).not.toBe(id2);
    });

    test('should generate ID with correct prefix', () => {
      const id = deployManager.generateDeploymentId();

      expect(id.startsWith('deploy-')).toBe(true);
    });

    test('should include timestamp in ID', () => {
      const before = Date.now();
      const id = deployManager.generateDeploymentId();
      const after = Date.now();

      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getStageTargets', () => {
    test('should return servers for test stage', () => {
      const stage = { name: 'test' };
      const targets = deployManager.getStageTargets(stage);

      expect(targets).toBeInstanceOf(Array);
      expect(targets.length).toBeGreaterThan(0);
    });

    test('should return servers for staging stage', () => {
      const stage = { name: 'staging' };
      const targets = deployManager.getStageTargets(stage);

      expect(targets).toBeInstanceOf(Array);
    });

    test('should return production servers as fallback for unknown stage', () => {
      const stage = { name: 'unknown-stage' };
      const targets = deployManager.getStageTargets(stage);

      expect(targets).toEqual(deployManager.config.stages.production.servers);
    });
  });

  describe('average', () => {
    test('should calculate average of array', () => {
      const result = deployManager.average([10, 20, 30]);
      expect(result).toBe(20);
    });

    test('should return 0 for empty array', () => {
      const result = deployManager.average([]);
      expect(result).toBe(0);
    });

    test('should handle single element array', () => {
      const result = deployManager.average([42]);
      expect(result).toBe(42);
    });

    test('should round to 2 decimal places', () => {
      const result = deployManager.average([1, 2, 3]);
      expect(result).toBe(2);
    });

    test('should handle decimal values', () => {
      const result = deployManager.average([1.5, 2.5, 3.5]);
      expect(result).toBe(2.5);
    });
  });

  describe('sleep', () => {
    test('should delay execution', async () => {
      const start = Date.now();
      await deployManager.sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
    });

    test('should resolve after specified time', async () => {
      const result = await deployManager.sleep(10);
      expect(result).toBeUndefined();
    });
  });

  describe('validateMetrics', () => {
    test('should pass when all metrics are within thresholds', () => {
      const metrics = {
        errorRate: 0.5,
        responseTime: 200,
        cpu: 50,
        memory: 60
      };

      const result = deployManager.validateMetrics(metrics, {});

      expect(result.passed).toBe(true);
    });

    test('should fail when error rate exceeds threshold', () => {
      const metrics = {
        errorRate: 2.0,
        responseTime: 200,
        cpu: 50,
        memory: 60
      };

      const result = deployManager.validateMetrics(metrics, {});

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('에러율');
    });

    test('should fail when response time exceeds threshold', () => {
      const metrics = {
        errorRate: 0.5,
        responseTime: 1000,
        cpu: 50,
        memory: 60
      };

      const result = deployManager.validateMetrics(metrics, {});

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('응답 시간');
    });

    test('should fail when CPU exceeds threshold', () => {
      const metrics = {
        errorRate: 0.5,
        responseTime: 200,
        cpu: 90,
        memory: 60
      };

      const result = deployManager.validateMetrics(metrics, {});

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('CPU');
    });

    test('should fail when memory exceeds threshold', () => {
      const metrics = {
        errorRate: 0.5,
        responseTime: 200,
        cpu: 50,
        memory: 95
      };

      const result = deployManager.validateMetrics(metrics, {});

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('메모리');
    });
  });

  describe('getStatus', () => {
    test('should return current status', () => {
      const status = deployManager.getStatus();

      expect(status).toHaveProperty('totalDeployments');
      expect(status).toHaveProperty('activeDeployments');
      expect(status).toHaveProperty('recentDeployments');
    });

    test('should track deployments count', () => {
      deployManager.deployments.set('deploy-1', { id: 'deploy-1' });
      deployManager.deployments.set('deploy-2', { id: 'deploy-2' });

      const status = deployManager.getStatus();

      expect(status.totalDeployments).toBe(2);
    });

    test('should track active deployments count', () => {
      deployManager.activeDeployments.add('deploy-1');

      const status = deployManager.getStatus();

      expect(status.activeDeployments).toBe(1);
    });

    test('should return recent deployments (last 10)', () => {
      for (let i = 0; i < 15; i++) {
        deployManager.deployments.set(`deploy-${i}`, { id: `deploy-${i}` });
      }

      const status = deployManager.getStatus();

      expect(status.recentDeployments.length).toBe(10);
    });
  });

  describe('healthCheck', () => {
    test('should return true when health check passes', async () => {
      const stage = { name: 'test' };

      const result = await deployManager.healthCheck(stage, 1);

      expect(result).toBe(true);
    });

    test('should retry on failure', async () => {
      let attempts = 0;
      mockSSHExecutor.execute = () => {
        attempts++;
        if (attempts < 2) {
          return Promise.resolve({
            success: true,
            results: [{ success: false, exitCode: 1 }]
          });
        }
        return Promise.resolve({
          success: true,
          results: [{ success: true, exitCode: 0 }]
        });
      };

      const stage = { name: 'test' };
      const result = await deployManager.healthCheck(stage, 3);

      expect(result).toBe(true);
      expect(attempts).toBe(2);
    });

    test('should throw after max attempts', async () => {
      mockSSHExecutor.execute = () =>
        Promise.resolve({
          success: true,
          results: [{ success: false, exitCode: 1 }]
        });

      const stage = { name: 'test' };

      await expect(deployManager.healthCheck(stage, 2)).rejects.toThrow('헬스 체크 실패');
    });
  });

  describe('requestApproval', () => {
    test('should return false by default (requires manual approval)', async () => {
      const deployment = { id: 'test-deploy' };
      const stage = { name: 'production-100' };

      const result = await deployManager.requestApproval(deployment, stage);

      expect(result).toBe(false);
    });
  });

  describe('rollback', () => {
    test('should update deployment status to rolled_back', async () => {
      const deployment = { id: 'test-deploy', status: 'failed' };
      deployManager.deployments.set('test-deploy', deployment);

      await deployManager.rollback('test-deploy', 'Test reason');

      expect(deployment.status).toBe('rolled_back');
      expect(deployment.rollbackReason).toBe('Test reason');
    });

    test('should throw when deployment not found', async () => {
      await expect(deployManager.rollback('nonexistent', 'reason')).rejects.toThrow('배포를 찾을 수 없음');
    });
  });

  describe('prepareDeployment', () => {
    test('should complete without error', async () => {
      const deployment = { id: 'test-deploy' };

      await expect(deployManager.prepareDeployment(deployment)).resolves.toBeUndefined();
    });
  });

  describe('createBackup', () => {
    test('should execute backup command on targets', async () => {
      let executedCommand = null;
      mockSSHExecutor.execute = (opts) => {
        executedCommand = opts.command;
        return Promise.resolve({ success: true, results: [] });
      };

      const targets = ['server1'];
      const stage = { name: 'test' };

      await deployManager.createBackup(targets, stage);

      expect(executedCommand).toContain('mkdir');
      expect(executedCommand).toContain('backup');
    });
  });

  describe('uploadPatchedFile', () => {
    test('should execute upload command', async () => {
      let executedCommand = null;
      mockSSHExecutor.execute = (opts) => {
        executedCommand = opts.command;
        return Promise.resolve({ success: true, results: [] });
      };

      const targets = ['server1'];
      const change = { file: '/app/test.js', patched: 'new content' };

      await deployManager.uploadPatchedFile(targets, change);

      expect(executedCommand).toContain('echo');
      expect(executedCommand).toContain('/app/test.js');
    });

    test('should escape single quotes in content', async () => {
      let executedCommand = null;
      mockSSHExecutor.execute = (opts) => {
        executedCommand = opts.command;
        return Promise.resolve({ success: true, results: [] });
      };

      const targets = ['server1'];
      const change = { file: '/app/test.js', patched: "content with 'quotes'" };

      await deployManager.uploadPatchedFile(targets, change);

      expect(executedCommand).toContain("\\'");
    });
  });

  describe('restartServices', () => {
    test('should execute restart command', async () => {
      let executedCommand = null;
      mockSSHExecutor.execute = (opts) => {
        executedCommand = opts.command;
        return Promise.resolve({ success: true, results: [] });
      };

      const targets = ['server1'];
      const serviceName = 'myapp';

      await deployManager.restartServices(targets, serviceName);

      expect(executedCommand).toContain('systemctl restart');
      expect(executedCommand).toContain('myapp');
    });
  });

  describe('switchTraffic', () => {
    test('should complete without error', async () => {
      await expect(deployManager.switchTraffic('green', 50)).resolves.toBeUndefined();
    });
  });

  describe('shutdownEnvironment', () => {
    test('should complete without error', async () => {
      await expect(deployManager.shutdownEnvironment('blue')).resolves.toBeUndefined();
    });
  });

  describe('verifyDeployment', () => {
    test('should complete without error', async () => {
      const targets = ['server1'];
      const patch = { id: 'patch-1' };

      await expect(deployManager.verifyDeployment(targets, patch)).resolves.toBeUndefined();
    });
  });

  describe('collectMetrics', () => {
    test('should return metrics object', async () => {
      const stage = { name: 'test' };

      const metrics = await deployManager.collectMetrics(stage);

      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('memory');
    });

    test('should return values within expected ranges', async () => {
      const stage = { name: 'test' };

      const metrics = await deployManager.collectMetrics(stage);

      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeLessThan(5);
      expect(metrics.responseTime).toBeGreaterThanOrEqual(50);
      expect(metrics.responseTime).toBeLessThan(200);
    });
  });

  describe('deployDirect', () => {
    test('should add stage to deployment stages', async () => {
      const deployment = {
        id: 'test-deploy',
        patch: { changes: [] },
        repository: {},
        stages: []
      };

      await deployManager.deployDirect(deployment);

      expect(deployment.stages.length).toBe(1);
      expect(deployment.stages[0].name).toBe('production');
      expect(deployment.stages[0].status).toBe('success');
    });
  });

  describe('deployToStage', () => {
    test('should create backup and upload files', async () => {
      const executedCommands = [];
      mockSSHExecutor.execute = (opts) => {
        executedCommands.push(opts.command);
        return Promise.resolve({ success: true, results: [] });
      };

      const deployment = {
        patch: { changes: [{ file: '/app/test.js', patched: 'content' }] },
        repository: { service: 'myapp' }
      };
      const stage = { name: 'test' };

      deployManager.config.restartRequired = false;
      await deployManager.deployToStage(deployment, stage);

      expect(executedCommands.some((cmd) => cmd.includes('backup'))).toBe(true);
      expect(executedCommands.some((cmd) => cmd.includes('echo'))).toBe(true);
    });
  });
});
