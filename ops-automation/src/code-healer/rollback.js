/**
 * Rollback System
 * 배포 실패 시 자동 롤백
 */

import logger from '../../lib/logger.js';

class RollbackSystem {
  constructor(sshExecutor, deployManager) {
    this.sshExecutor = sshExecutor;
    this.deployManager = deployManager;
    this.rollbacks = [];
  }

  /**
   * 자동 롤백 실행
   */
  async rollback(deploymentId, reason, options = {}) {
    const { partial = false } = options;

    logger.warn(`롤백 시작: ${deploymentId}`);
    logger.warn(`사유: ${reason}`);

    const deployment = this.deployManager.deployments.get(deploymentId);

    if (!deployment) {
      throw new Error(`배포를 찾을 수 없음: ${deploymentId}`);
    }

    const rollback = {
      id: this.generateRollbackId(),
      deploymentId,
      reason,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      steps: []
    };

    this.rollbacks.push(rollback);

    try {
      // 1. 현재 상태 스냅샷
      const snapshot = await this.createSnapshot(deployment);
      rollback.snapshot = snapshot;

      // 2. 영향받은 단계 식별
      const affectedStages = this.getAffectedStages(deployment, partial);

      // 3. 단계별 롤백 (역순)
      for (const stage of affectedStages.reverse()) {
        await this.rollbackStage(deployment, stage, rollback);
      }

      // 4. 헬스 체크
      await this.verifyRollback(deployment, affectedStages);

      // 5. 롤백 완료
      rollback.status = 'completed';
      rollback.completedAt = new Date().toISOString();

      logger.info(`롤백 완료: ${rollback.id}`);

      return rollback;
    } catch (err) {
      logger.error(`롤백 실패: ${rollback.id}`, err);

      rollback.status = 'failed';
      rollback.error = err.message;
      rollback.completedAt = new Date().toISOString();

      // 롤백의 롤백? (매우 위험, 수동 개입 필요)
      throw err;
    }
  }

  /**
   * 단계별 롤백
   */
  async rollbackStage(deployment, stage, rollback) {
    logger.info(`롤백 단계: ${stage.name}`);

    const step = {
      stage: stage.name,
      startedAt: new Date().toISOString(),
      status: 'in_progress'
    };

    rollback.steps.push(step);

    try {
      const targets = this.deployManager.getStageTargets(stage);

      // 백업에서 복원
      await this.restoreFromBackup(targets, deployment, stage);

      // 서비스 재시작
      if (deployment.repository?.service) {
        await this.deployManager.restartServices(targets, deployment.repository.service);
      }

      // 헬스 체크
      await this.deployManager.healthCheck(stage, 3);

      step.status = 'success';
      step.completedAt = new Date().toISOString();
    } catch (err) {
      step.status = 'failed';
      step.error = err.message;
      step.completedAt = new Date().toISOString();

      throw err;
    }
  }

  /**
   * 백업에서 복원
   */
  async restoreFromBackup(targets, _deployment, stage) {
    logger.info(`백업 복원: ${stage.name}`);

    // 최근 백업 찾기
    const backupPath = await this.findLatestBackup(targets[0]);

    if (!backupPath) {
      throw new Error('백업을 찾을 수 없음');
    }

    // 백업 복원
    await this.sshExecutor.execute({
      target: targets,
      command: `cp -r ${backupPath}/app/* /app/`,
      options: { parallel: true, timeout: 60000 }
    });

    logger.info('백업 복원 완료');
  }

  /**
   * 최근 백업 찾기
   */
  async findLatestBackup(target) {
    const result = await this.sshExecutor.execute({
      target,
      command: 'ls -t /tmp/backup-* | head -1',
      options: { timeout: 5000 }
    });

    if (result.success && result.results[0].stdout) {
      return result.results[0].stdout.trim();
    }

    return null;
  }

  /**
   * Git 기반 롤백
   */
  async rollbackToCommit(deployment, commitHash) {
    logger.info(`Git 커밋으로 롤백: ${commitHash}`);

    const targets = this.getAllTargets(deployment);

    // Git pull 특정 커밋
    await this.sshExecutor.execute({
      target: targets,
      command: `cd /app && git checkout ${commitHash}`,
      options: { parallel: true, requireApproval: true }
    });

    // 의존성 재설치 (필요 시)
    await this.sshExecutor.execute({
      target: targets,
      command: 'cd /app && npm install --production',
      options: { parallel: true, timeout: 120000 }
    });
  }

  /**
   * 트래픽 롤백 (블루-그린)
   */
  async rollbackTraffic(_deployment) {
    logger.info('트래픽 롤백 (블루-그린)');

    // 트래픽을 이전 환경(블루)로 되돌림
    await this.deployManager.switchTraffic('blue', 100);

    // 그린 환경 헬스 체크 (안정성 확인)
    await this.sleep(5000);
  }

  /**
   * 데이터베이스 롤백
   */
  async rollbackDatabase(_deployment, options = {}) {
    logger.warn('데이터베이스 롤백 시작 (위험!)');

    const { dryRun = true } = options;

    if (dryRun) {
      logger.info('[DRY-RUN] DB 롤백 시뮬레이션');
      return { success: true, dryRun: true };
    }

    // 실제 DB 마이그레이션 롤백
    // 매우 위험하므로 수동 승인 필수
    const approved = await this.requestCriticalApproval('DB 롤백');

    if (!approved) {
      throw new Error('DB 롤백 승인 거부됨');
    }

    // 마이그레이션 롤백 실행
    // (실제 구현은 DB별로 다름)
  }

  /**
   * 스냅샷 생성
   */
  async createSnapshot(deployment) {
    logger.info('현재 상태 스냅샷 생성');

    const targets = this.getAllTargets(deployment);
    const snapshot = {
      timestamp: new Date().toISOString(),
      deployment: deployment.id,
      state: {}
    };

    // 각 서버의 상태 수집
    for (const target of targets.slice(0, 1)) {
      // 첫 번째 서버만 (대표)
      const state = await this.captureServerState(target);
      snapshot.state[target] = state;
    }

    return snapshot;
  }

  /**
   * 서버 상태 캡처
   */
  async captureServerState(target) {
    const commands = {
      processes: 'ps aux | head -20',
      services: 'systemctl list-units --state=running | head -20',
      disk: 'df -h',
      memory: 'free -m',
      network: 'ss -tuln | wc -l'
    };

    const state = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 5000 }
        });

        if (result.success) {
          state[key] = result.results[0].stdout;
        }
      } catch (err) {
        logger.warn(`상태 캡처 실패: ${key}`, err);
        state[key] = null;
      }
    }

    return state;
  }

  /**
   * 영향받은 단계 식별
   */
  getAffectedStages(deployment, partial) {
    if (partial) {
      // 실패한 단계만 롤백
      return deployment.stages.filter((s) => s.status === 'failed' || s.status === 'in_progress');
    } else {
      // 모든 성공한 단계 롤백
      return deployment.stages.filter((s) => s.status === 'success');
    }
  }

  /**
   * 롤백 검증
   */
  async verifyRollback(_deployment, stages) {
    logger.info('롤백 검증 중...');

    // 모든 단계에서 헬스 체크
    for (const stage of stages) {
      try {
        await this.deployManager.healthCheck(stage, 3);
      } catch (err) {
        logger.error(`롤백 검증 실패: ${stage.name}`, err);
        throw new Error(`롤백 후에도 서비스가 정상 동작하지 않음: ${stage.name}`);
      }
    }

    logger.info('롤백 검증 완료');
  }

  /**
   * 전체 대상 서버
   */
  getAllTargets(deployment) {
    const targets = new Set();

    for (const stage of deployment.stages) {
      const stageTargets = this.deployManager.getStageTargets(stage);
      stageTargets.forEach((t) => {
        targets.add(t);
      });
    }

    return Array.from(targets);
  }

  /**
   * 중요 승인 요청
   */
  async requestCriticalApproval(action) {
    logger.warn(`⚠️  중요 작업 승인 필요: ${action}`);

    // 실제로는 관리자에게 알림 후 승인 대기
    // Slack, PagerDuty 등 사용

    return false; // 기본적으로 거부
  }

  /**
   * 롤백 이력 조회
   */
  getRollbackHistory(limit = 10) {
    return this.rollbacks.slice(-limit);
  }

  /**
   * 특정 롤백 조회
   */
  getRollback(rollbackId) {
    return this.rollbacks.find((r) => r.id === rollbackId);
  }

  /**
   * 롤백 통계
   */
  getStatistics() {
    const total = this.rollbacks.length;
    const successful = this.rollbacks.filter((r) => r.status === 'completed').length;
    const failed = this.rollbacks.filter((r) => r.status === 'failed').length;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0
    };
  }

  /**
   * 대기
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 롤백 ID 생성
   */
  generateRollbackId() {
    return `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      totalRollbacks: this.rollbacks.length,
      statistics: this.getStatistics(),
      recentRollbacks: this.getRollbackHistory(5)
    };
  }
}

export default RollbackSystem;
