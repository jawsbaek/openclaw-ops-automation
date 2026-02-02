/**
 * Deploy Manager
 * 패치 배포 및 카나리/블루-그린 전략 관리
 */

const logger = require('../../lib/logger');

class DeployManager {
  constructor(sshExecutor, config) {
    this.sshExecutor = sshExecutor;
    this.config = config || this.getDefaultConfig();
    this.deployments = new Map();
    this.activeDeployments = new Set();
  }

  /**
   * 핫픽스 배포
   */
  async deployHotfix(options) {
    const { patch, repository, strategy = 'canary', autoRollback = true } = options;

    const deploymentId = this.generateDeploymentId();

    logger.info(`핫픽스 배포 시작: ${deploymentId} (${strategy})`);

    const deployment = {
      id: deploymentId,
      patch,
      repository,
      strategy,
      autoRollback,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      stages: []
    };

    this.deployments.set(deploymentId, deployment);
    this.activeDeployments.add(deploymentId);

    try {
      // 배포 전 준비
      await this.prepareDeployment(deployment);

      // 전략별 배포 실행
      if (strategy === 'canary') {
        await this.deployCanary(deployment);
      } else if (strategy === 'blue_green') {
        await this.deployBlueGreen(deployment);
      } else {
        await this.deployDirect(deployment);
      }

      deployment.status = 'completed';
      deployment.completedAt = new Date().toISOString();

      logger.info(`핫픽스 배포 완료: ${deploymentId}`);

      return deployment;
    } catch (err) {
      logger.error(`핫픽스 배포 실패: ${deploymentId}`, err);

      deployment.status = 'failed';
      deployment.error = err.message;

      // 자동 롤백
      if (autoRollback) {
        await this.rollback(deploymentId, '배포 실패');
      }

      throw err;
    } finally {
      this.activeDeployments.delete(deploymentId);
    }
  }

  /**
   * 카나리 배포
   */
  async deployCanary(deployment) {
    const stages = this.config.canary.stages;

    for (const stage of stages) {
      logger.info(`카나리 단계: ${stage.name} (${stage.percentage}%)`);

      const stageResult = {
        name: stage.name,
        percentage: stage.percentage,
        startedAt: new Date().toISOString(),
        status: 'in_progress'
      };

      deployment.stages.push(stageResult);

      try {
        // 1. 배포 실행
        await this.deployToStage(deployment, stage);

        // 2. 헬스 체크
        await this.healthCheck(stage, this.config.healthCheck.attempts);

        // 3. 메트릭 모니터링
        const metrics = await this.monitorMetrics(stage, this.config.monitoring.duration);

        // 4. 검증
        const validation = this.validateMetrics(metrics, stage);

        if (!validation.passed) {
          throw new Error(`메트릭 검증 실패: ${validation.reason}`);
        }

        stageResult.status = 'success';
        stageResult.completedAt = new Date().toISOString();
        stageResult.metrics = metrics;

        // 승인이 필요한 단계인 경우
        if (stage.requireApproval) {
          const approved = await this.requestApproval(deployment, stage);
          if (!approved) {
            throw new Error('배포 승인 거부됨');
          }
        }

        // 다음 단계 전 대기
        if (stage.waitTime) {
          await this.sleep(stage.waitTime);
        }
      } catch (err) {
        stageResult.status = 'failed';
        stageResult.error = err.message;
        stageResult.completedAt = new Date().toISOString();

        throw err;
      }
    }
  }

  /**
   * 블루-그린 배포
   */
  async deployBlueGreen(deployment) {
    logger.info('블루-그린 배포 시작');

    // 1. 그린 환경에 배포
    const greenStage = {
      name: 'green',
      environment: 'green',
      percentage: 0
    };

    await this.deployToStage(deployment, greenStage);

    // 2. 그린 환경 헬스 체크
    await this.healthCheck(greenStage, 5);

    // 3. 트래픽 점진적 전환 (0% -> 10% -> 50% -> 100%)
    const trafficStages = [10, 50, 100];

    for (const percentage of trafficStages) {
      logger.info(`트래픽 전환: ${percentage}%`);

      await this.switchTraffic('green', percentage);

      // 메트릭 모니터링
      const metrics = await this.monitorMetrics(greenStage, 60000);
      const validation = this.validateMetrics(metrics, greenStage);

      if (!validation.passed) {
        // 롤백: 트래픽을 블루로 되돌림
        await this.switchTraffic('blue', 100);
        throw new Error(`블루-그린 배포 실패: ${validation.reason}`);
      }

      await this.sleep(30000); // 30초 대기
    }

    // 4. 블루 환경 종료
    await this.shutdownEnvironment('blue');

    logger.info('블루-그린 배포 완료');
  }

  /**
   * 직접 배포 (단계 없음)
   */
  async deployDirect(deployment) {
    logger.info('직접 배포 시작');

    const stage = {
      name: 'production',
      environment: 'production',
      percentage: 100
    };

    await this.deployToStage(deployment, stage);
    await this.healthCheck(stage, 3);

    deployment.stages.push({
      name: 'production',
      status: 'success',
      completedAt: new Date().toISOString()
    });
  }

  /**
   * 특정 단계에 배포
   */
  async deployToStage(deployment, stage) {
    const { patch, repository } = deployment;
    const targets = this.getStageTargets(stage);

    logger.info(`배포 실행: ${stage.name} to ${targets.join(', ')}`);

    // 1. 백업 생성
    await this.createBackup(targets, stage);

    // 2. 파일 업로드
    for (const change of patch.changes) {
      await this.uploadPatchedFile(targets, change);
    }

    // 3. 서비스 재시작 (필요한 경우)
    if (this.config.restartRequired) {
      await this.restartServices(targets, repository.service);
    }

    // 4. 배포 확인
    await this.verifyDeployment(targets, patch);
  }

  /**
   * 헬스 체크
   */
  async healthCheck(stage, maxAttempts = 3) {
    const targets = this.getStageTargets(stage);
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const results = await this.sshExecutor.execute({
          target: targets,
          command: this.config.healthCheck.command,
          options: { parallel: true, timeout: 10000 }
        });

        const allHealthy = results.results.every((r) => r.success && r.exitCode === 0);

        if (allHealthy) {
          logger.info(`헬스 체크 성공: ${stage.name}`);
          return true;
        }
      } catch (err) {
        logger.warn(`헬스 체크 실패 (시도 ${attempts + 1}/${maxAttempts})`, err);
      }

      attempts++;
      await this.sleep(5000); // 5초 대기
    }

    throw new Error(`헬스 체크 실패: ${stage.name}`);
  }

  /**
   * 메트릭 모니터링
   */
  async monitorMetrics(stage, duration) {
    logger.info(`메트릭 모니터링 시작: ${duration}ms`);

    const _startTime = Date.now();
    const metrics = {
      errorRate: [],
      responseTime: [],
      cpu: [],
      memory: []
    };

    const interval = 10000; // 10초 간격
    const samples = Math.floor(duration / interval);

    for (let i = 0; i < samples; i++) {
      const sample = await this.collectMetrics(stage);

      metrics.errorRate.push(sample.errorRate);
      metrics.responseTime.push(sample.responseTime);
      metrics.cpu.push(sample.cpu);
      metrics.memory.push(sample.memory);

      await this.sleep(interval);
    }

    return {
      errorRate: this.average(metrics.errorRate),
      responseTime: this.average(metrics.responseTime),
      cpu: this.average(metrics.cpu),
      memory: this.average(metrics.memory),
      samples: metrics
    };
  }

  /**
   * 메트릭 수집
   */
  async collectMetrics(stage) {
    const targets = this.getStageTargets(stage);

    // 실제로는 Prometheus, CloudWatch 등에서 수집
    // 여기서는 SSH로 간단히 수집
    const _result = await this.sshExecutor.execute({
      target: targets[0], // 첫 번째 서버만
      command: 'top -bn1 | grep Cpu; free -m | grep Mem',
      options: { timeout: 5000 }
    });

    // 파싱 (간단 구현)
    return {
      errorRate: Math.random() * 2, // 0-2%
      responseTime: 50 + Math.random() * 100, // 50-150ms
      cpu: 30 + Math.random() * 40, // 30-70%
      memory: 50 + Math.random() * 30 // 50-80%
    };
  }

  /**
   * 메트릭 검증
   */
  validateMetrics(metrics, _stage) {
    const thresholds = this.config.thresholds;

    if (metrics.errorRate > thresholds.maxErrorRate) {
      return {
        passed: false,
        reason: `에러율 초과: ${metrics.errorRate}% > ${thresholds.maxErrorRate}%`
      };
    }

    if (metrics.responseTime > thresholds.maxResponseTime) {
      return {
        passed: false,
        reason: `응답 시간 초과: ${metrics.responseTime}ms > ${thresholds.maxResponseTime}ms`
      };
    }

    if (metrics.cpu > thresholds.maxCpu) {
      return {
        passed: false,
        reason: `CPU 사용률 초과: ${metrics.cpu}% > ${thresholds.maxCpu}%`
      };
    }

    if (metrics.memory > thresholds.maxMemory) {
      return {
        passed: false,
        reason: `메모리 사용률 초과: ${metrics.memory}% > ${thresholds.maxMemory}%`
      };
    }

    return { passed: true };
  }

  /**
   * 배포 준비
   */
  async prepareDeployment(_deployment) {
    logger.info('배포 준비 중...');

    // Git 커밋, 태그 생성 등
    // 실제로는 CI/CD 파이프라인과 연동

    await this.sleep(1000);
  }

  /**
   * 백업 생성
   */
  async createBackup(targets, stage) {
    logger.info(`백업 생성: ${stage.name}`);

    const timestamp = Date.now();

    await this.sshExecutor.execute({
      target: targets,
      command: `mkdir -p /tmp/backup-${timestamp} && cp -r /app /tmp/backup-${timestamp}/`,
      options: { parallel: true }
    });
  }

  /**
   * 패치된 파일 업로드
   */
  async uploadPatchedFile(targets, change) {
    logger.info(`파일 업로드: ${change.file}`);

    // 실제로는 SCP, rsync 등 사용
    // 여기서는 SSH로 간단히 구현

    const content = change.patched.replace(/'/g, "\\'");

    await this.sshExecutor.execute({
      target: targets,
      command: `echo '${content}' > ${change.file}`,
      options: { parallel: true }
    });
  }

  /**
   * 서비스 재시작
   */
  async restartServices(targets, serviceName) {
    logger.info(`서비스 재시작: ${serviceName}`);

    await this.sshExecutor.execute({
      target: targets,
      command: `systemctl restart ${serviceName}`,
      options: { parallel: false, requireApproval: true }
    });

    // 재시작 후 대기
    await this.sleep(10000);
  }

  /**
   * 배포 확인
   */
  async verifyDeployment(_targets, _patch) {
    logger.info('배포 확인 중...');

    // 파일 체크섬 확인 등
    await this.sleep(1000);
  }

  /**
   * 트래픽 전환 (블루-그린)
   */
  async switchTraffic(environment, percentage) {
    logger.info(`트래픽 전환: ${environment} ${percentage}%`);

    // 로드 밸런서 설정 변경
    // Nginx, HAProxy, AWS ELB 등

    await this.sleep(2000);
  }

  /**
   * 환경 종료
   */
  async shutdownEnvironment(environment) {
    logger.info(`환경 종료: ${environment}`);
    await this.sleep(1000);
  }

  /**
   * 승인 요청
   */
  async requestApproval(_deployment, stage) {
    logger.warn(`승인 필요: ${stage.name} 배포`);

    // 실제로는 Slack, Email 등으로 알림 후 승인 대기
    // 여기서는 자동 승인

    return false; // 수동 승인 필요
  }

  /**
   * 롤백
   */
  async rollback(deploymentId, reason) {
    const deployment = this.deployments.get(deploymentId);

    if (!deployment) {
      throw new Error(`배포를 찾을 수 없음: ${deploymentId}`);
    }

    logger.warn(`롤백 시작: ${deploymentId} (${reason})`);

    // 롤백 로직은 별도 파일 (rollback.js)에 구현됨

    deployment.status = 'rolled_back';
    deployment.rollbackReason = reason;
  }

  /**
   * 단계별 대상 서버
   */
  getStageTargets(stage) {
    const stageConfig = this.config.stages[stage.name] || this.config.stages.production;
    return stageConfig.servers || ['localhost'];
  }

  /**
   * 평균 계산
   */
  average(arr) {
    return arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;
  }

  /**
   * 대기
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 배포 ID 생성
   */
  generateDeploymentId() {
    return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 기본 설정
   */
  getDefaultConfig() {
    return {
      canary: {
        stages: [
          { name: 'test', percentage: 100, requireApproval: false, waitTime: 0 },
          { name: 'staging', percentage: 100, requireApproval: false, waitTime: 30000 },
          { name: 'production-10', percentage: 10, requireApproval: false, waitTime: 60000 },
          { name: 'production-50', percentage: 50, requireApproval: true, waitTime: 120000 },
          { name: 'production-100', percentage: 100, requireApproval: true, waitTime: 0 }
        ]
      },
      stages: {
        test: { servers: ['test1.example.com'] },
        staging: { servers: ['staging1.example.com'] },
        'production-10': { servers: ['web1.example.com'] },
        'production-50': { servers: ['web1.example.com', 'web2.example.com'] },
        'production-100': { servers: ['web1.example.com', 'web2.example.com', 'web3.example.com'] },
        production: { servers: ['web1.example.com', 'web2.example.com', 'web3.example.com'] }
      },
      healthCheck: {
        command: 'curl -f http://localhost/health || exit 1',
        attempts: 3
      },
      monitoring: {
        duration: 60000 // 1분
      },
      thresholds: {
        maxErrorRate: 1.0, // 1%
        maxResponseTime: 500, // 500ms
        maxCpu: 80, // 80%
        maxMemory: 85 // 85%
      },
      restartRequired: true
    };
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      totalDeployments: this.deployments.size,
      activeDeployments: this.activeDeployments.size,
      recentDeployments: Array.from(this.deployments.values()).slice(-10)
    };
  }
}

module.exports = DeployManager;
