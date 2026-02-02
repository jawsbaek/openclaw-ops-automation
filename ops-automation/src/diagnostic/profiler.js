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
      return lines
        .map((line) => {
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
          return null;
        })
        .filter(Boolean);
    }

    return output;
  }

  /**
   * 메모리 데이터 파싱
   */
  parseMemoryData(type, output) {
    if (type === 'free') {
      const lines = output.split('\n');
      const memLine = lines.find((l) => l.startsWith('Mem:'));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        return {
          total: parseInt(parts[1], 10),
          used: parseInt(parts[2], 10),
          free: parseInt(parts[3], 10),
          available: parseInt(parts[6], 10),
          usagePercent: ((parseInt(parts[2], 10) / parseInt(parts[1], 10)) * 100).toFixed(2)
        };
      }
    }

    if (type === 'processes') {
      const lines = output.split('\n').slice(1);
      return lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            return {
              user: parts[0],
              pid: parts[1],
              mem: parseFloat(parts[3]),
              rss: parseInt(parts[5], 10),
              command: parts.slice(10).join(' ')
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    return output;
  }

  /**
   * 디스크 데이터 파싱
   */
  parseDiskData(type, output) {
    if (type === 'usage' || type === 'inodes') {
      const lines = output.split('\n').slice(1); // 헤더 제외
      return lines
        .map((line) => {
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
          return null;
        })
        .filter(Boolean);
    }

    return output;
  }

  /**
   * 네트워크 데이터 파싱
   */
  parseNetworkData(type, output) {
    if (type === 'listening' || type === 'established') {
      return parseInt(output.trim(), 10) || 0;
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
        const usage = parseInt(disk.usePercent, 10);
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
  compareProfiles(profile1, profile2) {
    if (!profile1 || !profile2) {
      return {
        error: 'Both profiles are required for comparison'
      };
    }

    const comparison = {
      timestamp1: profile1.timestamp,
      timestamp2: profile2.timestamp,
      target: profile1.target,
      changes: {}
    };

    // CPU 변화 비교
    if (profile1.cpu?.usage && profile2.cpu?.usage) {
      const cpuDelta = profile2.cpu.usage.usage - profile1.cpu.usage.usage;
      comparison.changes.cpu = {
        usage: {
          before: profile1.cpu.usage.usage,
          after: profile2.cpu.usage.usage,
          delta: cpuDelta,
          deltaPercent: ((cpuDelta / profile1.cpu.usage.usage) * 100).toFixed(2),
          trend: cpuDelta > 5 ? 'increasing' : cpuDelta < -5 ? 'decreasing' : 'stable'
        }
      };

      if (profile1.cpu.loadAverage && profile2.cpu.loadAverage) {
        comparison.changes.cpu.loadAverage = {
          '1min': {
            before: profile1.cpu.loadAverage['1min'],
            after: profile2.cpu.loadAverage['1min'],
            delta: (profile2.cpu.loadAverage['1min'] - profile1.cpu.loadAverage['1min']).toFixed(2)
          },
          '5min': {
            before: profile1.cpu.loadAverage['5min'],
            after: profile2.cpu.loadAverage['5min'],
            delta: (profile2.cpu.loadAverage['5min'] - profile1.cpu.loadAverage['5min']).toFixed(2)
          }
        };
      }
    }

    // 메모리 변화 비교
    if (profile1.memory?.summary && profile2.memory?.summary) {
      const memDelta = profile2.memory.summary.usagePercent - profile1.memory.summary.usagePercent;
      comparison.changes.memory = {
        usage: {
          before: profile1.memory.summary.usagePercent,
          after: profile2.memory.summary.usagePercent,
          delta: memDelta,
          trend: memDelta > 5 ? 'increasing' : memDelta < -5 ? 'decreasing' : 'stable'
        },
        used: {
          before: profile1.memory.summary.used,
          after: profile2.memory.summary.used,
          delta: profile2.memory.summary.used - profile1.memory.summary.used
        }
      };
    }

    // 디스크 변화 비교
    if (profile1.disk?.usage && profile2.disk?.usage) {
      comparison.changes.disk = [];
      for (const disk1 of profile1.disk.usage) {
        const disk2 = profile2.disk.usage.find((d) => d.mountPoint === disk1.mountPoint);
        if (disk2) {
          const usage1 = parseInt(disk1.usePercent, 10);
          const usage2 = parseInt(disk2.usePercent, 10);
          comparison.changes.disk.push({
            mountPoint: disk1.mountPoint,
            before: usage1,
            after: usage2,
            delta: usage2 - usage1,
            trend: usage2 > usage1 ? 'increasing' : usage2 < usage1 ? 'decreasing' : 'stable'
          });
        }
      }
    }

    // 네트워크 변화 비교
    if (profile1.network?.establishedConnections && profile2.network?.establishedConnections) {
      const connDelta = profile2.network.establishedConnections - profile1.network.establishedConnections;
      comparison.changes.network = {
        connections: {
          before: profile1.network.establishedConnections,
          after: profile2.network.establishedConnections,
          delta: connDelta,
          deltaPercent: ((connDelta / profile1.network.establishedConnections) * 100).toFixed(2)
        }
      };
    }

    // 병목 지점 변화
    comparison.bottleneckChanges = {
      before: profile1.bottlenecks?.length || 0,
      after: profile2.bottlenecks?.length || 0,
      new: profile2.bottlenecks?.filter((b2) => !profile1.bottlenecks?.some((b1) => b1.type === b2.type)) || [],
      resolved: profile1.bottlenecks?.filter((b1) => !profile2.bottlenecks?.some((b2) => b2.type === b1.type)) || []
    };

    return comparison;
  }

  /**
   * 최적화 권장사항 생성
   */
  generateRecommendations(profile) {
    if (!profile) {
      return {
        error: 'Profile is required for generating recommendations'
      };
    }

    const recommendations = [];

    // CPU 최적화
    if (profile.cpu?.usage) {
      const cpuUsage = profile.cpu.usage.usage;
      if (cpuUsage > 90) {
        recommendations.push({
          category: 'cpu',
          severity: 'critical',
          issue: `Critical CPU usage: ${cpuUsage.toFixed(2)}%`,
          recommendations: [
            'Identify and optimize CPU-intensive processes',
            'Consider scaling horizontally (add more instances)',
            'Review application code for CPU bottlenecks',
            'Implement caching to reduce computation'
          ],
          priority: 1
        });
      } else if (cpuUsage > 75) {
        recommendations.push({
          category: 'cpu',
          severity: 'high',
          issue: `High CPU usage: ${cpuUsage.toFixed(2)}%`,
          recommendations: [
            'Monitor top CPU-consuming processes',
            'Consider implementing rate limiting',
            'Review and optimize inefficient algorithms'
          ],
          priority: 2
        });
      }

      if (profile.cpu.loadAverage?.['1min'] > 4) {
        recommendations.push({
          category: 'cpu',
          severity: 'high',
          issue: `High load average: ${profile.cpu.loadAverage['1min']}`,
          recommendations: [
            'Check for process queue buildup',
            'Review concurrent process limits',
            'Consider upgrading CPU resources'
          ],
          priority: 2
        });
      }
    }

    // 메모리 최적화
    if (profile.memory?.summary) {
      const memUsage = parseFloat(profile.memory.summary.usagePercent);
      if (memUsage > 90) {
        recommendations.push({
          category: 'memory',
          severity: 'critical',
          issue: `Critical memory usage: ${memUsage}%`,
          recommendations: [
            'Investigate memory leaks immediately',
            'Restart memory-intensive processes',
            'Implement memory limits for containers/processes',
            'Consider adding more RAM'
          ],
          priority: 1
        });
      } else if (memUsage > 80) {
        recommendations.push({
          category: 'memory',
          severity: 'high',
          issue: `High memory usage: ${memUsage}%`,
          recommendations: [
            'Review application memory consumption patterns',
            'Implement garbage collection tuning',
            'Monitor for memory leaks',
            'Consider implementing object pooling'
          ],
          priority: 2
        });
      }

      if (profile.memory.topProcesses && profile.memory.topProcesses.length > 0) {
        const topProcess = profile.memory.topProcesses[0];
        if (topProcess && topProcess.mem > 30) {
          recommendations.push({
            category: 'memory',
            severity: 'medium',
            issue: `Single process consuming ${topProcess.mem}% memory: ${topProcess.command}`,
            recommendations: [
              'Review process memory configuration',
              'Consider splitting workload across multiple processes',
              'Implement memory profiling for this process'
            ],
            priority: 3
          });
        }
      }
    }

    // 디스크 최적화
    if (profile.disk?.usage) {
      for (const disk of profile.disk.usage) {
        const usage = parseInt(disk.usePercent, 10);
        if (usage > 95) {
          recommendations.push({
            category: 'disk',
            severity: 'critical',
            issue: `Critical disk usage on ${disk.mountPoint}: ${disk.usePercent}`,
            recommendations: [
              'Clean up logs and temporary files immediately',
              'Archive or delete old data',
              'Implement log rotation policies',
              'Expand disk capacity urgently'
            ],
            priority: 1
          });
        } else if (usage > 85) {
          recommendations.push({
            category: 'disk',
            severity: 'high',
            issue: `High disk usage on ${disk.mountPoint}: ${disk.usePercent}`,
            recommendations: [
              'Review and clean up large files',
              'Implement automated cleanup scripts',
              'Set up monitoring alerts',
              'Plan for capacity expansion'
            ],
            priority: 2
          });
        }
      }
    }

    // 네트워크 최적화
    if (profile.network?.establishedConnections) {
      const connections = profile.network.establishedConnections;
      if (connections > 50000) {
        recommendations.push({
          category: 'network',
          severity: 'critical',
          issue: `Excessive network connections: ${connections}`,
          recommendations: [
            'Review connection pooling configuration',
            'Implement connection limits',
            'Check for connection leaks',
            'Consider using a load balancer'
          ],
          priority: 1
        });
      } else if (connections > 20000) {
        recommendations.push({
          category: 'network',
          severity: 'medium',
          issue: `High network connections: ${connections}`,
          recommendations: [
            'Monitor connection patterns',
            'Optimize keep-alive settings',
            'Review timeout configurations'
          ],
          priority: 3
        });
      }
    }

    // 병목 지점 기반 권장사항
    if (profile.bottlenecks && profile.bottlenecks.length > 0) {
      recommendations.push({
        category: 'general',
        severity: 'high',
        issue: `${profile.bottlenecks.length} bottleneck(s) detected`,
        recommendations: profile.bottlenecks.map((b) => b.recommendation),
        priority: 1
      });
    }

    // 우선순위로 정렬
    recommendations.sort((a, b) => a.priority - b.priority);

    return {
      timestamp: new Date().toISOString(),
      target: profile.target,
      totalRecommendations: recommendations.length,
      critical: recommendations.filter((r) => r.severity === 'critical').length,
      high: recommendations.filter((r) => r.severity === 'high').length,
      medium: recommendations.filter((r) => r.severity === 'medium').length,
      recommendations
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
