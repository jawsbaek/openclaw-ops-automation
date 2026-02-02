/**
 * Remote Executor
 * SSH를 통한 원격 명령 안전 실행
 */

const fs = require('fs').promises;
const path = require('path');
const SSHConnectionPool = require('./connection-pool');
const logger = require('../../lib/logger');

class RemoteExecutor {
  constructor(serversConfig, whitelistConfig) {
    this.serversConfig = serversConfig;
    this.whitelistConfig = whitelistConfig;
    this.connectionPool = new SSHConnectionPool({
      maxConnections: 50,
      idleTimeout: 300000
    });
    
    this.executionHistory = [];
    this.pendingApprovals = new Map();
  }

  /**
   * 명령 실행 (단일 또는 그룹)
   */
  async execute(options) {
    const { target, command, options: execOptions = {} } = options;
    
    // 명령 검증
    if (!this.isCommandAllowed(command, execOptions)) {
      throw new Error(`명령 실행 거부: ${command}`);
    }

    // 대상 서버 해석
    const hosts = this.resolveTargets(target);
    
    if (hosts.length === 0) {
      throw new Error(`대상 서버를 찾을 수 없음: ${target}`);
    }

    // 승인이 필요한 경우
    if (execOptions.requireApproval) {
      const approved = await this.requestApproval(command, hosts);
      if (!approved) {
        throw new Error('명령 실행이 승인되지 않음');
      }
    }

    // dry-run 모드
    if (execOptions.dryRun) {
      return this.simulateExecution(command, hosts);
    }

    // 병렬 또는 순차 실행
    const results = execOptions.parallel 
      ? await this.executeParallel(command, hosts, execOptions)
      : await this.executeSequential(command, hosts, execOptions);

    // 실행 이력 저장
    this.recordExecution(command, hosts, results);

    return this.formatResults(results);
  }

  /**
   * 병렬 실행
   */
  async executeParallel(command, hosts, options) {
    const promises = hosts.map(host => 
      this.executeOnHost(host, command, options)
        .catch(err => ({
          host,
          success: false,
          error: err.message
        }))
    );

    return await Promise.all(promises);
  }

  /**
   * 순차 실행
   */
  async executeSequential(command, hosts, options) {
    const results = [];
    
    for (const host of hosts) {
      try {
        const result = await this.executeOnHost(host, command, options);
        results.push(result);
      } catch (err) {
        results.push({
          host,
          success: false,
          error: err.message
        });
      }
    }
    
    return results;
  }

  /**
   * 단일 호스트에서 명령 실행
   */
  async executeOnHost(host, command, options) {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;
    
    try {
      const serverConfig = this.getServerConfig(host);
      const client = await this.connectionPool.getConnection(host, serverConfig);
      
      const result = await this.execCommand(client, command, timeout);
      
      this.connectionPool.releaseConnection(host);
      
      return {
        host,
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      logger.error(`명령 실행 실패: ${host}`, err);
      throw err;
    }
  }

  /**
   * SSH 명령 실행
   */
  execCommand(client, command, timeout) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`명령 타임아웃: ${timeout}ms`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        stream.on('close', (code, signal) => {
          clearTimeout(timer);
          if (!timedOut) {
            resolve({
              exitCode: code,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              signal
            });
          }
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * 명령 허용 여부 확인
   */
  isCommandAllowed(command, options) {
    if (!this.whitelistConfig) {
      return true; // 화이트리스트 없으면 모두 허용
    }

    // 위험한 명령 패턴 체크
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /dd\s+if=/,
      /mkfs/,
      /fdisk/,
      /:(){ :|:& };:/  // fork bomb
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        if (!options.requireApproval) {
          logger.warn(`위험한 명령 차단: ${command}`);
          return false;
        }
      }
    }

    // 화이트리스트 체크
    const whitelist = this.whitelistConfig.allowedCommands || [];
    const commandBase = command.split(' ')[0];
    
    return whitelist.includes(commandBase) || whitelist.includes('*');
  }

  /**
   * 대상 해석 (그룹 -> 호스트 목록)
   */
  resolveTargets(target) {
    if (Array.isArray(target)) {
      return target;
    }

    // 그룹 체크
    if (this.serversConfig.groups && this.serversConfig.groups[target]) {
      return this.serversConfig.groups[target];
    }

    // 단일 호스트
    return [target];
  }

  /**
   * 서버 설정 가져오기
   */
  getServerConfig(host) {
    const sshConfig = this.serversConfig.ssh || {};
    
    return {
      host,
      port: sshConfig.port || 22,
      username: sshConfig.user,
      privateKey: sshConfig.privateKey || this.loadPrivateKey(sshConfig.key_path)
    };
  }

  /**
   * SSH 키 로드
   */
  loadPrivateKey(keyPath) {
    try {
      return require('fs').readFileSync(keyPath, 'utf8');
    } catch (err) {
      logger.error(`SSH 키 로드 실패: ${keyPath}`, err);
      throw new Error('SSH 키를 찾을 수 없음');
    }
  }

  /**
   * 승인 요청 (실제 구현에서는 이벤트 발생)
   */
  async requestApproval(command, hosts) {
    const requestId = Date.now().toString();
    
    logger.warn(`승인 필요: ${command} on ${hosts.join(', ')}`);
    
    // 실제로는 이벤트를 발생시켜 Orchestrator가 처리
    this.pendingApprovals.set(requestId, {
      command,
      hosts,
      timestamp: Date.now()
    });

    // 임시: 자동 승인 (프로덕션에서는 실제 승인 로직 필요)
    return false; // 기본적으로 거부
  }

  /**
   * Dry-run 시뮬레이션
   */
  simulateExecution(command, hosts) {
    logger.info(`[DRY-RUN] ${command} on ${hosts.join(', ')}`);
    
    return {
      success: true,
      dryRun: true,
      results: hosts.map(host => ({
        host,
        exitCode: 0,
        stdout: '[DRY-RUN] 실행되지 않음',
        stderr: '',
        duration: 0,
        timestamp: new Date().toISOString()
      })),
      summary: {
        total: hosts.length,
        succeeded: hosts.length,
        failed: 0
      }
    };
  }

  /**
   * 실행 이력 기록
   */
  recordExecution(command, hosts, results) {
    const record = {
      timestamp: new Date().toISOString(),
      command,
      hosts,
      results,
      summary: this.getSummary(results)
    };
    
    this.executionHistory.push(record);
    
    // 최대 1000개 유지
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }

    // 감사 로그에 기록
    logger.info('SSH 명령 실행', {
      command,
      hosts: hosts.length,
      succeeded: record.summary.succeeded,
      failed: record.summary.failed
    });
  }

  /**
   * 결과 포맷팅
   */
  formatResults(results) {
    return {
      success: results.every(r => r.success),
      results,
      summary: this.getSummary(results)
    };
  }

  /**
   * 요약 통계
   */
  getSummary(results) {
    return {
      total: results.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      connectionPool: this.connectionPool.getStatus(),
      executionHistory: this.executionHistory.slice(-10), // 최근 10개
      pendingApprovals: Array.from(this.pendingApprovals.values())
    };
  }

  /**
   * 종료
   */
  shutdown() {
    this.connectionPool.closeAll();
    logger.info('RemoteExecutor 종료');
  }
}

module.exports = RemoteExecutor;
