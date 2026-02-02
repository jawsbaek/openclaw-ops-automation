/**
 * Performance Profiler
 * 시스템 성능 프로파일링 및 병목 지점 분석
 */

import createLogger from '../../lib/logger.js';

const logger = createLogger('profiler');

class Profiler {
  constructor(sshExecutor) {
    this.sshExecutor = sshExecutor;
    this.profiles = new Map();
  }

  /**
   * 전체 시스템 프로파일링
   */
  async profileSystem(target, duration = 10000) {
    logger.info(`시스템 프로파일링 시작: ${target} (${duration}ms)`);

    const profiles = await Promise.all([
      this.profileCPU(target, duration),
      this.profileMemory(target),
      this.profileDisk(target),
      this.profileNetwork(target)
    ]);

    const [cpu, memory, disk, network] = profiles;

    const result = {
      target,
      timestamp: new Date().toISOString(),
      duration,
      cpu,
      memory,
      disk,
      network,
      bottlenecks: this.identifyBottlenecks({ cpu, memory, disk, network })
    };

    this.profiles.set(target, result);

    return result;
  }

  /**
   * CPU 프로파일링
   */
  async profileCPU(target, duration) {
    const commands = {
      usage: 'top -bn2 -d 1 | grep "Cpu(s)" | tail -1',
      processes: 'ps aux --sort=-pcpu | head -20',
      loadAvg: 'uptime',
      context: 'vmstat 1 3 | tail -1'
    };

    const results = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: duration }
        });

        if (result.success) {
          results[key] = this.parseCPUData(key, result.results[0].stdout);
        }
      } catch (err) {
        logger.error(`CPU 프로파일링 오류: ${key}`, err);
        results[key] = null;
      }
    }

    return {
      usage: results.usage,
      topProcesses: results.processes,
      loadAverage: results.loadAvg,
      contextSwitching: results.context
    };
  }

  /**
   * 메모리 프로파일링
   */
  async profileMemory(target) {
    const commands = {
      free: 'free -m',
      processes: 'ps aux --sort=-rss | head -20',
      meminfo: 'cat /proc/meminfo | head -20',
      swap: 'swapon -s'
    };

    const results = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 5000 }
        });

        if (result.success) {
          results[key] = this.parseMemoryData(key, result.results[0].stdout);
        }
      } catch (err) {
        logger.error(`메모리 프로파일링 오류: ${key}`, err);
        results[key] = null;
      }
    }

    return {
      summary: results.free,
      topProcesses: results.processes,
      details: results.meminfo,
      swap: results.swap
    };
  }

  /**
   * 디스크 프로파일링
   */
  async profileDisk(target) {
    const commands = {
      usage: 'df -h',
      inodes: 'df -i',
      io: 'iostat -x 1 3 | tail -n +4',
      topDirs: 'du -sh /var/* /tmp/* /home/* 2>/dev/null | sort -hr | head -10'
    };

    const results = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 30000 }
        });

        if (result.success) {
          results[key] = this.parseDiskData(key, result.results[0].stdout);
        }
      } catch (err) {
        logger.error(`디스크 프로파일링 오류: ${key}`, err);
        results[key] = null;
      }
    }

    return {
      usage: results.usage,
      inodes: results.inodes,
      io: results.io,
      largestDirs: results.topDirs
    };
  }

  /**
   * 네트워크 프로파일링
   */
  async profileNetwork(target) {
    const commands = {
      interfaces: 'ip -s link',
      connections: 'ss -s',
      listening: 'ss -tuln | wc -l',
      established: 'ss -tan | grep ESTAB | wc -l',
      errors: 'netstat -i'
    };

    const results = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 5000 }
        });

        if (result.success) {
          results[key] = this.parseNetworkData(key, result.results[0].stdout);
        }
      } catch (err) {
        logger.error(`네트워크 프로파일링 오류: ${key}`, err);
        results[key] = null;
      }
    }

    return {
      interfaces: results.interfaces,
      connectionStats: results.connections,
      listeningPorts: results.listening,
      establishedConnections: results.established,
      errors: results.errors
    };
  }

  /**
   * 프로세스 심층 분석
   */
  async profileProcess(target, pid) {
    logger.info(`프로세스 프로파일링: PID ${pid} on ${target}`);

    const commands = {
      details: `ps -p ${pid} -o pid,ppid,cmd,user,%cpu,%mem,vsz,rss,stat,start,time`,
      threads: `ps -T -p ${pid}`,
      openFiles: `lsof -p ${pid} | wc -l`,
      connections: `lsof -i -a -p ${pid}`,
      memoryMap: `cat /proc/${pid}/status`
    };

    const results = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshExecutor.execute({
          target,
          command,
          options: { timeout: 10000 }
        });

        if (result.success) {
          results[key] = result.results[0].stdout;
        }
      } catch (err) {
        logger.error(`프로세스 프로파일링 오류: ${key}`, err);
        results[key] = null;
      }
    }

    return {
      pid,
      target,
      timestamp: new Date().toISOString(),
      ...results
    };
  }

  /**
   * CPU 데이터 파싱
   */
  parseCPUData(type, output) {
    if (type === 'usage') {
      const match = output.match(/(\d+\.\d+)\s+us.*?(\d+\.\d+)\s+sy.*?(\d+\.\d+)\s+id/);
      if (match) {
        return {
          user: parseFloat(match[1]),
          system: parseFloat(match[2]),
          idle: parseFloat(match[3]),
          usage: 100 - parseFloat(match[3])
        };
      }
    }

    if (type === 'loadAvg') {
      const match = output.match(/load average:\s+([\d.]+),\s+([\d.]+),\s+([\d.]+)/);
      if (match) {
        return {
          '1min': parseFloat(match[1]),
          '5min': parseFloat(match[2]),
          '15min': parseFloat(match[3])
        };
      }
    }

    if (type === 'processes') {
      const lines = output.split('\n').slice(1); // 헤더 제외
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          return {
            user: parts[0],
            pid: parts[1],
            cpu: parseFloat(parts[2]),
            mem: parseFloat(parts[3]),
            command: parts.slice(10).join(' ')
          };
        }
      }).filter(Boolean);
    }

    return output;
  }

  /**
   * 메모리 데이터 파싱
   */
  parseMemoryData(type, output) {
    if (type === 'free') {
      const lines = output.split('\n');
      const memLine = lines.find(l => l.startsWith('Mem:'));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        return {
          total: parseInt(parts[1]),
          used: parseInt(parts[2]),
          free: parseInt(parts[3]),
          available: parseInt(parts[6]),
          usagePercent: ((parseInt(parts[2]) / parseInt(parts[1])) * 100).toFixed(2)
        };
      }
    }

    if (type === 'processes') {
      const lines = output.split('\n').slice(1);
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          return {
            user: parts[0],
            pid: parts[1],
            mem: parseFloat(parts[3]),
            rss: parseInt(parts[5]),
            command: parts.slice(10).join(' ')
          };
        }
      }).filter(Boolean);
    }

    return output;
  }

  /**
   * 디스크 데이터 파싱
   */
  parseDiskData(type, output) {
    if (type === 'usage' || type === 'inodes') {
      const lines = output.split('\n').slice(1); // 헤더 제외
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          return {
            filesystem: parts[0],
            size: parts[1],
            used: parts[2],
            available: parts[3],
            usePercent: parts[4],
            mountPoint: parts[5]
          };
        }
      }).filter(Boolean);
    }

    return output;
  }

  /**
   * 네트워크 데이터 파싱
   */
  parseNetworkData(type, output) {
    if (type === 'listening' || type === 'established') {
      return parseInt(output.trim()) || 0;
    }

    return output;
  }

  /**
   * 병목 지점 식별
   */
  identifyBottlenecks(profiles) {
    const bottlenecks = [];

    // CPU 병목
    if (profiles.cpu?.usage?.usage > 80) {
      bottlenecks.push({
        type: 'cpu',
        severity: 'high',
        message: `높은 CPU 사용률: ${profiles.cpu.usage.usage.toFixed(2)}%`,
        recommendation: 'CPU 집약적 프로세스 확인 필요'
      });
    }

    // 메모리 병목
    if (profiles.memory?.summary?.usagePercent > 85) {
      bottlenecks.push({
        type: 'memory',
        severity: 'high',
        message: `높은 메모리 사용률: ${profiles.memory.summary.usagePercent}%`,
        recommendation: '메모리 누수 또는 프로세스 재시작 검토'
      });
    }

    // 디스크 병목
    if (profiles.disk?.usage) {
      for (const disk of profiles.disk.usage) {
        const usage = parseInt(disk.usePercent);
        if (usage > 90) {
          bottlenecks.push({
            type: 'disk',
            severity: 'critical',
            message: `디스크 공간 부족: ${disk.mountPoint} (${disk.usePercent})`,
            recommendation: '로그 정리 또는 파티션 확장 필요'
          });
        }
      }
    }

    // 네트워크 병목
    if (profiles.network?.establishedConnections > 10000) {
      bottlenecks.push({
        type: 'network',
        severity: 'medium',
        message: `높은 연결 수: ${profiles.network.establishedConnections}`,
        recommendation: '커넥션 풀 설정 검토'
      });
    }

    return bottlenecks;
  }

  /**
   * 프로파일 비교
   */
  compareProfiles(target, timestamp1, timestamp2) {
    // 구현: 두 시점의 프로파일 비교하여 변화 감지
    return {
      compared: true,
      message: '프로파일 비교 기능 구현 예정'
    };
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      profileCount: this.profiles.size,
      targets: Array.from(this.profiles.keys())
    };
  }
}

export default Profiler;
