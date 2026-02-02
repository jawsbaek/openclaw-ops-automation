/**
 * Profiler Tests
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Profiler from '../../../src/diagnostic/profiler.js';

describe('Profiler', () => {
  let profiler;
  let mockSshExecutor;

  beforeEach(() => {
    mockSshExecutor = {
      execute: jest.fn()
    };
    profiler = new Profiler(mockSshExecutor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('profileSystem()', () => {
    test('should profile entire system', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: 'mock output' }]
      });

      const result = await profiler.profileSystem('server1', 10000);

      expect(result.target).toBe('server1');
      expect(result.cpu).toBeDefined();
      expect(result.memory).toBeDefined();
      expect(result.disk).toBeDefined();
      expect(result.network).toBeDefined();
      expect(result.bottlenecks).toBeDefined();
      expect(result.timestamp).toBeTruthy();
      expect(profiler.profiles.has('server1')).toBe(true);
    });

    test('should store profile in profiles Map', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await profiler.profileSystem('server1');

      expect(profiler.profiles.size).toBe(1);
      expect(profiler.profiles.get('server1')).toBeDefined();
    });
  });

  describe('profileCPU()', () => {
    test('should collect CPU usage data', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{
          host: 'server1',
          success: true,
          stdout: '%Cpu(s): 25.0 us, 10.0 sy, 0.0 ni, 65.0 id, 0.0 wa'
        }]
      });

      const result = await profiler.profileCPU('server1', 5000);

      expect(result.usage).toBeDefined();
      expect(mockSshExecutor.execute).toHaveBeenCalled();
    });

    test('should handle CPU profiling errors gracefully', async () => {
      mockSshExecutor.execute.mockRejectedValue(new Error('SSH error'));

      const result = await profiler.profileCPU('server1', 5000);

      expect(result.usage).toBeNull();
    });

    test('should collect all CPU metrics', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      const result = await profiler.profileCPU('server1');

      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('topProcesses');
      expect(result).toHaveProperty('loadAverage');
      expect(result).toHaveProperty('contextSwitching');
    });
  });

  describe('profileMemory()', () => {
    test('should collect memory data', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      const result = await profiler.profileMemory('server1');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('topProcesses');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('swap');
    });

    test('should handle memory profiling errors', async () => {
      mockSshExecutor.execute.mockRejectedValue(new Error('Connection failed'));

      const result = await profiler.profileMemory('server1');

      expect(result.summary).toBeNull();
    });
  });

  describe('profileDisk()', () => {
    test('should collect disk usage data', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      const result = await profiler.profileDisk('server1');

      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('inodes');
      expect(result).toHaveProperty('io');
      expect(result).toHaveProperty('largestDirs');
    });

    test('should have longer timeout for disk operations', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await profiler.profileDisk('server1');

      const calls = mockSshExecutor.execute.mock.calls;
      const timeouts = calls.map(call => call[0].options.timeout);
      expect(Math.max(...timeouts)).toBe(30000);
    });
  });

  describe('profileNetwork()', () => {
    test('should collect network statistics', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      const result = await profiler.profileNetwork('server1');

      expect(result).toHaveProperty('interfaces');
      expect(result).toHaveProperty('connectionStats');
      expect(result).toHaveProperty('listeningPorts');
      expect(result).toHaveProperty('establishedConnections');
      expect(result).toHaveProperty('errors');
    });

    test('should handle network profiling errors', async () => {
      mockSshExecutor.execute.mockRejectedValue(new Error('Network unreachable'));

      const result = await profiler.profileNetwork('server1');

      expect(result.interfaces).toBeNull();
    });
  });

  describe('profileProcess()', () => {
    test('should profile specific process by PID', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: 'process data' }]
      });

      const result = await profiler.profileProcess('server1', 1234);

      expect(result.pid).toBe(1234);
      expect(result.target).toBe('server1');
      expect(result.timestamp).toBeTruthy();
      expect(result.details).toBeDefined();
    });

    test('should collect process threads', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: 'thread data' }]
      });

      const result = await profiler.profileProcess('server1', 1234);

      expect(result.threads).toBeDefined();
    });

    test('should handle process profiling errors', async () => {
      mockSshExecutor.execute.mockRejectedValue(new Error('Process not found'));

      const result = await profiler.profileProcess('server1', 9999);

      expect(result.details).toBeNull();
    });
  });

  describe('parseCPUData()', () => {
    test('should parse CPU usage data', () => {
      const output = '%Cpu(s): 25.5 us, 10.2 sy, 0.0 ni, 64.3 id, 0.0 wa';
      const result = profiler.parseCPUData('usage', output);

      expect(result.user).toBe(25.5);
      expect(result.system).toBe(10.2);
      expect(result.idle).toBe(64.3);
      expect(result.usage).toBe(100 - 64.3);
    });

    test('should parse load average', () => {
      const output = 'load average: 1.23, 2.34, 3.45';
      const result = profiler.parseCPUData('loadAvg', output);

      expect(result['1min']).toBe(1.23);
      expect(result['5min']).toBe(2.34);
      expect(result['15min']).toBe(3.45);
    });

    test('should parse top processes', () => {
      const output = `USER       PID  %CPU  %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  25.5  10.2 123456  7890 ?        Ss   Jan01 100:00 /usr/bin/process
user      1234  15.0   5.0  98765  4321 ?        R    10:00   5:30 /app/worker`;

      const result = profiler.parseCPUData('processes', output);

      expect(result).toHaveLength(2);
      expect(result[0].user).toBe('root');
      expect(result[0].pid).toBe('1');
      expect(result[0].cpu).toBe(25.5);
      expect(result[0].mem).toBe(10.2);
    });

    test('should filter invalid process lines', () => {
      const output = `USER       PID
invalid line
root         1  25.5  10.2 123456  7890 ?        Ss   Jan01 100:00 /usr/bin/process`;

      const result = profiler.parseCPUData('processes', output);

      expect(result).toHaveLength(1);
      expect(result[0].user).toBe('root');
    });

    test('should return raw output for unknown types', () => {
      const output = 'raw data';
      const result = profiler.parseCPUData('unknown', output);

      expect(result).toBe('raw data');
    });
  });

  describe('parseMemoryData()', () => {
    test('should parse free command output', () => {
      const output = `              total        used        free      shared  buff/cache   available
Mem:          16384        8192        4096         512        4096        7168`;

      const result = profiler.parseMemoryData('free', output);

      expect(result.total).toBe(16384);
      expect(result.used).toBe(8192);
      expect(result.free).toBe(4096);
      expect(result.available).toBe(7168);
      expect(parseFloat(result.usagePercent)).toBeCloseTo(50, 1);
    });

    test('should parse memory processes', () => {
      const output = `USER       PID  %CPU  %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
user      1234   5.0  25.5 123456  2048 ?        S    10:00   1:00 /app/worker`;

      const result = profiler.parseMemoryData('processes', output);

      expect(result).toHaveLength(1);
      expect(result[0].mem).toBe(25.5);
      expect(result[0].rss).toBe(2048);
    });

    test('should return raw output for unknown types', () => {
      const output = 'meminfo data';
      const result = profiler.parseMemoryData('meminfo', output);

      expect(result).toBe('meminfo data');
    });
  });

  describe('parseDiskData()', () => {
    test('should parse df output', () => {
      const output = `Filesystem     Size  Used Avail Use% Mounted on
/dev/sda1       100G   75G   25G  75% /
/dev/sdb1       500G  400G  100G  80% /data`;

      const result = profiler.parseDiskData('usage', output);

      expect(result).toHaveLength(2);
      expect(result[0].filesystem).toBe('/dev/sda1');
      expect(result[0].size).toBe('100G');
      expect(result[0].used).toBe('75G');
      expect(result[0].usePercent).toBe('75%');
      expect(result[0].mountPoint).toBe('/');
    });

    test('should parse inode usage', () => {
      const output = `Filesystem     Inodes  IUsed  IFree IUse% Mounted on
/dev/sda1      6553600 123456 543210   18% /`;

      const result = profiler.parseDiskData('inodes', output);

      expect(result).toHaveLength(1);
      expect(result[0].usePercent).toBe('18%');
    });

    test('should filter invalid disk lines', () => {
      const output = `Filesystem     Size
invalid
/dev/sda1       100G   75G   25G  75% /`;

      const result = profiler.parseDiskData('usage', output);

      expect(result).toHaveLength(1);
    });

    test('should return raw output for unknown types', () => {
      const output = 'io stats';
      const result = profiler.parseDiskData('io', output);

      expect(result).toBe('io stats');
    });
  });

  describe('parseNetworkData()', () => {
    test('should parse numeric values for connections', () => {
      const output = '  1234  ';
      const result = profiler.parseNetworkData('listening', output);

      expect(result).toBe(1234);
    });

    test('should parse established connections', () => {
      const output = '5678';
      const result = profiler.parseNetworkData('established', output);

      expect(result).toBe(5678);
    });

    test('should return 0 for invalid numbers', () => {
      const output = 'not a number';
      const result = profiler.parseNetworkData('listening', output);

      expect(result).toBe(0);
    });

    test('should return raw output for other types', () => {
      const output = 'interface data';
      const result = profiler.parseNetworkData('interfaces', output);

      expect(result).toBe('interface data');
    });
  });

  describe('identifyBottlenecks()', () => {
    test('should identify high CPU usage', () => {
      const profiles = {
        cpu: { usage: { usage: 85 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      expect(bottlenecks.length).toBeGreaterThan(0);
      const cpuBottleneck = bottlenecks.find(b => b.type === 'cpu');
      expect(cpuBottleneck).toBeDefined();
      expect(cpuBottleneck.severity).toBe('high');
    });

    test('should identify high memory usage', () => {
      const profiles = {
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 90 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      const memBottleneck = bottlenecks.find(b => b.type === 'memory');
      expect(memBottleneck).toBeDefined();
      expect(memBottleneck.severity).toBe('high');
      expect(memBottleneck.message).toContain('90%');
    });

    test('should identify disk space issues', () => {
      const profiles = {
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 50 } },
        disk: {
          usage: [
            { mountPoint: '/', usePercent: '95%' },
            { mountPoint: '/data', usePercent: '75%' }
          ]
        },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      const diskBottleneck = bottlenecks.find(b => b.type === 'disk');
      expect(diskBottleneck).toBeDefined();
      expect(diskBottleneck.severity).toBe('critical');
      expect(diskBottleneck.message).toContain('/');
    });

    test('should identify high connection count', () => {
      const profiles = {
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [] },
        network: { establishedConnections: 15000 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      const netBottleneck = bottlenecks.find(b => b.type === 'network');
      expect(netBottleneck).toBeDefined();
      expect(netBottleneck.severity).toBe('medium');
    });

    test('should return empty array when no bottlenecks', () => {
      const profiles = {
        cpu: { usage: { usage: 30 } },
        memory: { summary: { usagePercent: 40 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '50%' }] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      expect(bottlenecks).toHaveLength(0);
    });

    test('should provide recommendations for each bottleneck', () => {
      const profiles = {
        cpu: { usage: { usage: 85 } },
        memory: { summary: { usagePercent: 90 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(profiles);

      bottlenecks.forEach(bottleneck => {
        expect(bottleneck.recommendation).toBeTruthy();
      });
    });
  });

  describe('compareProfiles()', () => {
    test('should return comparison placeholder', () => {
      const result = profiler.compareProfiles('server1', 't1', 't2');

      expect(result.compared).toBe(true);
      expect(result.message).toBeTruthy();
    });
  });

  describe('getStatus()', () => {
    test('should return profile count and targets', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{ host: 'server1', success: true, stdout: '' }]
      });

      await profiler.profileSystem('server1');
      await profiler.profileSystem('server2');

      const status = profiler.getStatus();

      expect(status.profileCount).toBe(2);
      expect(status.targets).toContain('server1');
      expect(status.targets).toContain('server2');
    });

    test('should return empty status initially', () => {
      const status = profiler.getStatus();

      expect(status.profileCount).toBe(0);
      expect(status.targets).toHaveLength(0);
    });
  });

  describe('Integration', () => {
    test('should handle complete profiling workflow', async () => {
      mockSshExecutor.execute.mockResolvedValue({
        success: true,
        results: [{
          host: 'server1',
          success: true,
          stdout: '%Cpu(s): 85.0 us, 10.0 sy, 0.0 ni, 5.0 id, 0.0 wa'
        }]
      });

      const profile = await profiler.profileSystem('server1', 5000);

      expect(profile.target).toBe('server1');
      expect(profile.bottlenecks).toBeDefined();
      
      const status = profiler.getStatus();
      expect(status.profileCount).toBe(1);
    });

    test('should handle partial failures gracefully', async () => {
      let callCount = 0;
      mockSshExecutor.execute.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Command failed'));
        }
        return Promise.resolve({
          success: true,
          results: [{ host: 'server1', success: true, stdout: 'data' }]
        });
      });

      const profile = await profiler.profileSystem('server1');

      expect(profile).toBeDefined();
      expect(profile.cpu).toBeDefined();
      expect(profile.memory).toBeDefined();
    });
  });
});
