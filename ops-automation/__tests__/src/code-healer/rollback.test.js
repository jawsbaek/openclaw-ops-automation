import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

const { default: RollbackSystem } = await import('../../../src/code-healer/rollback.js');

describe('RollbackSystem', () => {
  let rollbackSystem;
  let mockSSHExecutor;
  let mockDeployManager;

  beforeEach(() => {
    mockSSHExecutor = {
      execute: vi.fn(() =>
        Promise.resolve({
          success: true,
          results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0, success: true }]
        })
      )
    };

    mockDeployManager = {
      deployments: new Map(),
      getStageTargets: vi.fn(() => ['server1', 'server2']),
      restartServices: vi.fn(() => Promise.resolve()),
      healthCheck: vi.fn(() => Promise.resolve(true)),
      switchTraffic: vi.fn(() => Promise.resolve())
    };

    rollbackSystem = new RollbackSystem(mockSSHExecutor, mockDeployManager);
  });

  describe('Constructor', () => {
    test('should initialize with SSH executor and deploy manager', () => {
      expect(rollbackSystem.sshExecutor).toBe(mockSSHExecutor);
      expect(rollbackSystem.deployManager).toBe(mockDeployManager);
    });

    test('should initialize empty rollbacks array', () => {
      expect(rollbackSystem.rollbacks).toBeInstanceOf(Array);
      expect(rollbackSystem.rollbacks.length).toBe(0);
    });
  });

  describe('generateRollbackId', () => {
    test('should generate unique rollback IDs', () => {
      const id1 = rollbackSystem.generateRollbackId();
      const id2 = rollbackSystem.generateRollbackId();

      expect(id1).not.toBe(id2);
    });

    test('should generate ID with correct prefix', () => {
      const id = rollbackSystem.generateRollbackId();

      expect(id.startsWith('rollback-')).toBe(true);
    });

    test('should include timestamp in ID', () => {
      const before = Date.now();
      const id = rollbackSystem.generateRollbackId();
      const after = Date.now();

      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getAffectedStages', () => {
    test('should return failed and in_progress stages for partial rollback', () => {
      const deployment = {
        stages: [
          { name: 'test', status: 'success' },
          { name: 'staging', status: 'failed' },
          { name: 'production', status: 'in_progress' }
        ]
      };

      const stages = rollbackSystem.getAffectedStages(deployment, true);

      expect(stages.length).toBe(2);
      expect(stages[0].name).toBe('staging');
      expect(stages[1].name).toBe('production');
    });

    test('should return all successful stages for full rollback', () => {
      const deployment = {
        stages: [
          { name: 'test', status: 'success' },
          { name: 'staging', status: 'success' },
          { name: 'production', status: 'failed' }
        ]
      };

      const stages = rollbackSystem.getAffectedStages(deployment, false);

      expect(stages.length).toBe(2);
      expect(stages[0].name).toBe('test');
      expect(stages[1].name).toBe('staging');
    });

    test('should return empty array when no stages match', () => {
      const deployment = {
        stages: [
          { name: 'test', status: 'pending' },
          { name: 'staging', status: 'pending' }
        ]
      };

      const stages = rollbackSystem.getAffectedStages(deployment, true);

      expect(stages.length).toBe(0);
    });
  });

  describe('getAllTargets', () => {
    test('should collect all unique targets from all stages', () => {
      mockDeployManager.getStageTargets.mockImplementation((stage) => {
        if (stage.name === 'test') return ['server1', 'server2'];
        if (stage.name === 'staging') return ['server2', 'server3'];
        return ['server4'];
      });

      const deployment = {
        stages: [{ name: 'test' }, { name: 'staging' }, { name: 'production' }]
      };

      const targets = rollbackSystem.getAllTargets(deployment);

      expect(targets.length).toBe(4);
      expect(targets).toContain('server1');
      expect(targets).toContain('server2');
      expect(targets).toContain('server3');
      expect(targets).toContain('server4');
    });

    test('should return empty array when no stages', () => {
      const deployment = { stages: [] };

      const targets = rollbackSystem.getAllTargets(deployment);

      expect(targets.length).toBe(0);
    });
  });

  describe('getRollbackHistory', () => {
    test('should return last N rollbacks', () => {
      for (let i = 0; i < 15; i++) {
        rollbackSystem.rollbacks.push({ id: `rollback-${i}` });
      }

      const history = rollbackSystem.getRollbackHistory(5);

      expect(history.length).toBe(5);
      expect(history[0].id).toBe('rollback-10');
      expect(history[4].id).toBe('rollback-14');
    });

    test('should return all rollbacks when limit exceeds total', () => {
      for (let i = 0; i < 3; i++) {
        rollbackSystem.rollbacks.push({ id: `rollback-${i}` });
      }

      const history = rollbackSystem.getRollbackHistory(10);

      expect(history.length).toBe(3);
    });

    test('should return empty array when no rollbacks', () => {
      const history = rollbackSystem.getRollbackHistory(10);

      expect(history.length).toBe(0);
    });

    test('should use default limit of 10', () => {
      for (let i = 0; i < 20; i++) {
        rollbackSystem.rollbacks.push({ id: `rollback-${i}` });
      }

      const history = rollbackSystem.getRollbackHistory();

      expect(history.length).toBe(10);
    });
  });

  describe('getRollback', () => {
    test('should find rollback by ID', () => {
      const rollback = { id: 'rollback-123', status: 'completed' };
      rollbackSystem.rollbacks.push(rollback);

      const found = rollbackSystem.getRollback('rollback-123');

      expect(found).toBe(rollback);
    });

    test('should return undefined when rollback not found', () => {
      const found = rollbackSystem.getRollback('nonexistent');

      expect(found).toBeUndefined();
    });
  });

  describe('getStatistics', () => {
    test('should calculate total rollbacks', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'failed' });

      const stats = rollbackSystem.getStatistics();

      expect(stats.total).toBe(2);
    });

    test('should count successful rollbacks', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'failed' });

      const stats = rollbackSystem.getStatistics();

      expect(stats.successful).toBe(2);
    });

    test('should count failed rollbacks', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'failed' });
      rollbackSystem.rollbacks.push({ status: 'failed' });

      const stats = rollbackSystem.getStatistics();

      expect(stats.failed).toBe(2);
    });

    test('should calculate success rate', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'failed' });

      const stats = rollbackSystem.getStatistics();

      expect(stats.successRate).toBe('66.67');
    });

    test('should return 0 success rate when no rollbacks', () => {
      const stats = rollbackSystem.getStatistics();

      expect(stats.successRate).toBe(0);
    });

    test('should return 100 success rate when all successful', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });
      rollbackSystem.rollbacks.push({ status: 'completed' });

      const stats = rollbackSystem.getStatistics();

      expect(stats.successRate).toBe('100.00');
    });
  });

  describe('getStatus', () => {
    test('should return status object with required properties', () => {
      const status = rollbackSystem.getStatus();

      expect(status).toHaveProperty('totalRollbacks');
      expect(status).toHaveProperty('statistics');
      expect(status).toHaveProperty('recentRollbacks');
    });

    test('should include total rollbacks count', () => {
      rollbackSystem.rollbacks.push({ id: 'rollback-1' });
      rollbackSystem.rollbacks.push({ id: 'rollback-2' });

      const status = rollbackSystem.getStatus();

      expect(status.totalRollbacks).toBe(2);
    });

    test('should include statistics', () => {
      rollbackSystem.rollbacks.push({ status: 'completed' });

      const status = rollbackSystem.getStatus();

      expect(status.statistics).toHaveProperty('total');
      expect(status.statistics).toHaveProperty('successful');
      expect(status.statistics).toHaveProperty('failed');
      expect(status.statistics).toHaveProperty('successRate');
    });

    test('should include recent rollbacks (last 5)', () => {
      for (let i = 0; i < 10; i++) {
        rollbackSystem.rollbacks.push({ id: `rollback-${i}` });
      }

      const status = rollbackSystem.getStatus();

      expect(status.recentRollbacks.length).toBe(5);
    });
  });

  describe('sleep', () => {
    test('should delay execution', async () => {
      const start = Date.now();
      await rollbackSystem.sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    test('should resolve after specified time', async () => {
      const result = await rollbackSystem.sleep(10);
      expect(result).toBeUndefined();
    });
  });

  describe('requestCriticalApproval', () => {
    test('should return false by default', async () => {
      const result = await rollbackSystem.requestCriticalApproval('DB Rollback');

      expect(result).toBe(false);
    });

    test('should accept action parameter', async () => {
      const result = await rollbackSystem.requestCriticalApproval('Custom Action');

      expect(result).toBe(false);
    });
  });

  describe('findLatestBackup', () => {
    test('should return backup path when found', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-2024-01-15', stderr: '', exitCode: 0 }]
      });

      const backup = await rollbackSystem.findLatestBackup('server1');

      expect(backup).toBe('/tmp/backup-2024-01-15');
    });

    test('should return null when no backup found', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '', stderr: '', exitCode: 0 }]
      });

      const backup = await rollbackSystem.findLatestBackup('server1');

      expect(backup).toBeNull();
    });

    test('should return null when command fails', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: false,
        results: [{ stdout: '', stderr: 'error', exitCode: 1 }]
      });

      const backup = await rollbackSystem.findLatestBackup('server1');

      expect(backup).toBeNull();
    });

    test('should trim whitespace from backup path', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '  /tmp/backup-123  \n', stderr: '', exitCode: 0 }]
      });

      const backup = await rollbackSystem.findLatestBackup('server1');

      expect(backup).toBe('/tmp/backup-123');
    });
  });

  describe('captureServerState', () => {
    test('should capture all state types', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: 'state data', stderr: '', exitCode: 0 }]
      });

      const state = await rollbackSystem.captureServerState('server1');

      expect(state).toHaveProperty('processes');
      expect(state).toHaveProperty('services');
      expect(state).toHaveProperty('disk');
      expect(state).toHaveProperty('memory');
      expect(state).toHaveProperty('network');
    });

    test('should set null for failed captures', async () => {
      mockSSHExecutor.execute.mockRejectedValue(new Error('SSH error'));

      const state = await rollbackSystem.captureServerState('server1');

      expect(state.processes).toBeNull();
      expect(state.services).toBeNull();
      expect(state.disk).toBeNull();
      expect(state.memory).toBeNull();
      expect(state.network).toBeNull();
    });

    test('should capture stdout for successful commands', async () => {
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: 'process list', stderr: '', exitCode: 0 }]
      });

      const state = await rollbackSystem.captureServerState('server1');

      expect(state.processes).toBe('process list');
    });
  });

  describe('createSnapshot', () => {
    test('should create snapshot with timestamp and deployment ID', async () => {
      const deployment = { id: 'deploy-123', stages: [{ name: 'test' }] };

      const snapshot = await rollbackSystem.createSnapshot(deployment);

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('deployment');
      expect(snapshot).toHaveProperty('state');
      expect(snapshot.deployment).toBe('deploy-123');
    });

    test('should capture state for first server only', async () => {
      mockDeployManager.getStageTargets.mockImplementation(() => ['server1', 'server2', 'server3']);
      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: 'state', stderr: '', exitCode: 0 }]
      });

      const deployment = { id: 'deploy-123', stages: [{ name: 'test' }] };

      const snapshot = await rollbackSystem.createSnapshot(deployment);

      expect(Object.keys(snapshot.state).length).toBe(1);
      expect(snapshot.state).toHaveProperty('server1');
    });

    test('should include ISO timestamp', async () => {
      const deployment = { id: 'deploy-123', stages: [{ name: 'test' }] };

      const snapshot = await rollbackSystem.createSnapshot(deployment);

      expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('rollbackDatabase', () => {
    test('should return success for dry run', async () => {
      const result = await rollbackSystem.rollbackDatabase({}, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    test('should throw when approval denied for actual rollback', async () => {
      await expect(rollbackSystem.rollbackDatabase({}, { dryRun: false })).rejects.toThrow('DB 롤백 승인 거부됨');
    });

    test('should use dryRun true by default', async () => {
      const result = await rollbackSystem.rollbackDatabase({});

      expect(result.dryRun).toBe(true);
    });
  });

  describe('rollbackTraffic', () => {
    test('should switch traffic to blue environment', async () => {
      await rollbackSystem.rollbackTraffic({});

      expect(mockDeployManager.switchTraffic).toHaveBeenCalledWith('blue', 100);
    });

    test('should sleep after traffic switch', async () => {
      const sleepSpy = vi.spyOn(rollbackSystem, 'sleep').mockResolvedValue(undefined);

      await rollbackSystem.rollbackTraffic({});

      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });
  });

  describe('rollbackToCommit', () => {
    test('should execute git checkout command', async () => {
      const deployment = { stages: [{ name: 'test' }] };

      await rollbackSystem.rollbackToCommit(deployment, 'abc123');

      expect(mockSSHExecutor.execute).toHaveBeenCalled();
      const call = mockSSHExecutor.execute.mock.calls[0][0];
      expect(call.command).toContain('git checkout abc123');
    });

    test('should execute npm install after checkout', async () => {
      const deployment = { stages: [{ name: 'test' }] };

      await rollbackSystem.rollbackToCommit(deployment, 'abc123');

      const calls = mockSSHExecutor.execute.mock.calls;
      expect(calls.some((c) => c[0].command.includes('npm install'))).toBe(true);
    });

    test('should use all targets', async () => {
      mockDeployManager.getStageTargets.mockReturnValue(['server1', 'server2']);
      const deployment = { stages: [{ name: 'test' }] };

      await rollbackSystem.rollbackToCommit(deployment, 'abc123');

      const call = mockSSHExecutor.execute.mock.calls[0][0];
      expect(call.target).toContain('server1');
      expect(call.target).toContain('server2');
    });
  });

  describe('restoreFromBackup', () => {
    test('should find latest backup', async () => {
      const targets = ['server1'];
      const deployment = { id: 'deploy-123' };
      const stage = { name: 'test' };

      await rollbackSystem.restoreFromBackup(targets, deployment, stage);

      expect(mockSSHExecutor.execute).toHaveBeenCalled();
    });

    test('should throw when no backup found', async () => {
      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '', stderr: '', exitCode: 0 }]
      });

      const targets = ['server1'];
      const deployment = { id: 'deploy-123' };
      const stage = { name: 'test' };

      await expect(rollbackSystem.restoreFromBackup(targets, deployment, stage)).rejects.toThrow('백업을 찾을 수 없음');
    });

    test('should execute restore command with backup path', async () => {
      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      const targets = ['server1'];
      const deployment = { id: 'deploy-123' };
      const stage = { name: 'test' };

      await rollbackSystem.restoreFromBackup(targets, deployment, stage);

      const calls = mockSSHExecutor.execute.mock.calls;
      const restoreCall = calls.find((c) => c[0].command.includes('cp -r'));
      expect(restoreCall[0].command).toContain('/tmp/backup-123');
    });
  });

  describe('rollbackStage', () => {
    test('should add step to rollback', async () => {
      const deployment = { id: 'deploy-123', repository: { service: 'myapp' } };
      const stage = { name: 'test' };
      const rollback = { steps: [] };

      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollbackStage(deployment, stage, rollback);

      expect(rollback.steps.length).toBe(1);
      expect(rollback.steps[0].stage).toBe('test');
    });

    test('should set step status to success on completion', async () => {
      const deployment = { id: 'deploy-123', repository: { service: 'myapp' } };
      const stage = { name: 'test' };
      const rollback = { steps: [] };

      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollbackStage(deployment, stage, rollback);

      expect(rollback.steps[0].status).toBe('success');
    });

    test('should set step status to failed on error', async () => {
      const deployment = { id: 'deploy-123', repository: { service: 'myapp' } };
      const stage = { name: 'test' };
      const rollback = { steps: [] };

      mockSSHExecutor.execute.mockRejectedValueOnce(new Error('SSH error'));

      await expect(rollbackSystem.rollbackStage(deployment, stage, rollback)).rejects.toThrow();

      expect(rollback.steps[0].status).toBe('failed');
    });

    test('should restart services if specified', async () => {
      const deployment = { id: 'deploy-123', repository: { service: 'myapp' } };
      const stage = { name: 'test' };
      const rollback = { steps: [] };

      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollbackStage(deployment, stage, rollback);

      expect(mockDeployManager.restartServices).toHaveBeenCalledWith(['server1', 'server2'], 'myapp');
    });

    test('should perform health check', async () => {
      const deployment = { id: 'deploy-123', repository: { service: 'myapp' } };
      const stage = { name: 'test' };
      const rollback = { steps: [] };

      mockSSHExecutor.execute.mockResolvedValueOnce({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollbackStage(deployment, stage, rollback);

      expect(mockDeployManager.healthCheck).toHaveBeenCalledWith(stage, 3);
    });
  });

  describe('verifyRollback', () => {
    test('should perform health check on all stages', async () => {
      const deployment = { id: 'deploy-123' };
      const stages = [{ name: 'test' }, { name: 'staging' }];

      await rollbackSystem.verifyRollback(deployment, stages);

      expect(mockDeployManager.healthCheck).toHaveBeenCalledTimes(2);
    });

    test('should throw when health check fails', async () => {
      mockDeployManager.healthCheck.mockRejectedValueOnce(new Error('Health check failed'));

      const deployment = { id: 'deploy-123' };
      const stages = [{ name: 'test' }];

      await expect(rollbackSystem.verifyRollback(deployment, stages)).rejects.toThrow(
        '롤백 후에도 서비스가 정상 동작하지 않음'
      );
    });
  });

  describe('rollback', () => {
    test('should create rollback record with initial status', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      expect(rollbackSystem.rollbacks.length).toBe(1);
      expect(rollbackSystem.rollbacks[0].status).toBe('completed');
    });

    test('should throw when deployment not found', async () => {
      await expect(rollbackSystem.rollback('nonexistent', 'reason')).rejects.toThrow('배포를 찾을 수 없음');
    });

    test('should set status to failed on error', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);
      mockSSHExecutor.execute.mockRejectedValue(new Error('SSH error'));

      await expect(rollbackSystem.rollback('deploy-123', 'Test failure')).rejects.toThrow();

      expect(rollbackSystem.rollbacks[0].status).toBe('failed');
    });

    test('should create snapshot', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      expect(rollbackSystem.rollbacks[0]).toHaveProperty('snapshot');
    });

    test('should include deployment ID and reason', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      expect(rollbackSystem.rollbacks[0].deploymentId).toBe('deploy-123');
      expect(rollbackSystem.rollbacks[0].reason).toBe('Test failure');
    });

    test('should include timestamps', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      expect(rollbackSystem.rollbacks[0]).toHaveProperty('startedAt');
      expect(rollbackSystem.rollbacks[0]).toHaveProperty('completedAt');
    });

    test('should support partial rollback option', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [
          { name: 'test', status: 'success' },
          { name: 'staging', status: 'failed' }
        ]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure', { partial: true });

      expect(rollbackSystem.rollbacks[0].status).toBe('completed');
    });

    test('should rollback stages in reverse order', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [
          { name: 'test', status: 'success' },
          { name: 'staging', status: 'success' }
        ]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      const steps = rollbackSystem.rollbacks[0].steps;
      expect(steps[0].stage).toBe('staging');
      expect(steps[1].stage).toBe('test');
    });

    test('should verify rollback after completion', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);

      mockSSHExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ stdout: '/tmp/backup-123', stderr: '', exitCode: 0 }]
      });

      await rollbackSystem.rollback('deploy-123', 'Test failure');

      expect(mockDeployManager.healthCheck).toHaveBeenCalled();
    });

    test('should include error message on failure', async () => {
      const deployment = {
        id: 'deploy-123',
        stages: [{ name: 'test', status: 'success' }]
      };
      mockDeployManager.deployments.set('deploy-123', deployment);
      mockSSHExecutor.execute.mockRejectedValue(new Error('SSH connection failed'));

      await expect(rollbackSystem.rollback('deploy-123', 'Test failure')).rejects.toThrow();

      expect(rollbackSystem.rollbacks[0].error).toBe('SSH connection failed');
    });
  });
});
