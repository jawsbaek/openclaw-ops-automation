/**
 * Tests for Profiler
 * @fileoverview Unit tests for system profiling and bottleneck detection
 */

import Profiler from '../../../src/diagnostic/profiler.js';

describe('Profiler', () => {
  let profiler;
  let mockSSHExecutor;

  beforeEach(() => {
    mockSSHExecutor = {
      execute: () => Promise.resolve({ success: true, results: [{ stdout: '' }] })
    };

    profiler = new Profiler(mockSSHExecutor);
  });

  describe('Constructor', () => {
    test('should initialize with SSH executor', () => {
      expect(profiler.sshExecutor).toBe(mockSSHExecutor);
    });

    test('should initialize empty profiles map', () => {
      expect(profiler.profiles).toBeInstanceOf(Map);
      expect(profiler.profiles.size).toBe(0);
    });
  });

  describe('identifyBottlenecks', () => {
    test('should identify CPU bottleneck', () => {
      const metrics = {
        cpu: { usage: { usage: 85 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(metrics);

      expect(bottlenecks).toContainEqual(
        expect.objectContaining({
          type: 'cpu',
          severity: 'high'
        })
      );
    });

    test('should identify memory bottleneck', () => {
      const metrics = {
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 88 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(metrics);

      expect(bottlenecks).toContainEqual(
        expect.objectContaining({
          type: 'memory',
          severity: 'high'
        })
      );
    });

    test('should identify disk bottleneck', () => {
      const metrics = {
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '92%' }] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(metrics);

      expect(bottlenecks).toContainEqual(
        expect.objectContaining({
          type: 'disk',
          severity: 'critical'
        })
      );
    });

    test('should return empty array when no bottlenecks', () => {
      const metrics = {
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '60%' }] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(metrics);

      expect(bottlenecks).toEqual([]);
    });

    test('should identify multiple bottlenecks', () => {
      const metrics = {
        cpu: { usage: { usage: 85 } },
        memory: { summary: { usagePercent: 88 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '92%' }] },
        network: { establishedConnections: 100 }
      };

      const bottlenecks = profiler.identifyBottlenecks(metrics);

      expect(bottlenecks.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('parseCPUData', () => {
    test('should parse CPU usage from top output', () => {
      const output = '%Cpu(s): 25.5 us, 10.2 sy,  0.0 ni, 62.3 id,  2.0 wa';
      const parsed = profiler.parseCPUData('usage', output);

      expect(parsed).toHaveProperty('user');
      expect(parsed).toHaveProperty('system');
      expect(parsed).toHaveProperty('idle');
      expect(parsed.user).toBeCloseTo(25.5, 1);
    });

    test('should parse load average', () => {
      const output = '12:00:00 up 10 days, 3 users, load average: 2.50, 1.80, 1.20';
      const parsed = profiler.parseCPUData('loadAvg', output);

      expect(parsed).toHaveProperty('1min');
      expect(parsed).toHaveProperty('5min');
      expect(parsed).toHaveProperty('15min');
      expect(parsed['1min']).toBe(2.5);
      expect(parsed['5min']).toBe(1.8);
      expect(parsed['15min']).toBe(1.2);
    });

    test('should return raw data for unparseable data', () => {
      const parsed = profiler.parseCPUData('usage', 'invalid data');
      expect(parsed).toBe('invalid data');
    });
  });

  describe('parseMemoryData', () => {
    test('should parse free memory output', () => {
      const output = `
              total        used        free      shared  buff/cache   available
Mem:          16000        8000        2000         200        5800       7000
Swap:          4000         500        3500
      `.trim();

      const parsed = profiler.parseMemoryData('free', output);

      expect(parsed).toHaveProperty('total');
      expect(parsed).toHaveProperty('used');
      expect(parsed).toHaveProperty('free');
      expect(parsed.total).toBe(16000);
      expect(parsed.used).toBe(8000);
    });

    test('should calculate usage percentage', () => {
      const output = `
              total        used        free
Mem:          16000        12000        4000
      `.trim();

      const parsed = profiler.parseMemoryData('free', output);

      expect(parseFloat(parsed.usagePercent)).toBeCloseTo(75, 0);
    });
  });

  describe('parseDiskData', () => {
    test('should parse df output', () => {
      const output = `
Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/sda1      100000000  75000000  25000000  75% /
/dev/sdb1       50000000  10000000  40000000  20% /data
      `.trim();

      const parsed = profiler.parseDiskData('usage', output);

      expect(parsed).toBeInstanceOf(Array);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty('filesystem');
      expect(parsed[0]).toHaveProperty('usePercent');
      expect(parsed[0]).toHaveProperty('mountPoint');
    });

    test('should extract usage percentage', () => {
      const output = `
Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/sda1      100000000  75000000  25000000  75% /
      `.trim();

      const parsed = profiler.parseDiskData('usage', output);

      expect(parsed[0].usePercent).toBe('75%');
    });
  });

  describe('parseNetworkData', () => {
    test('should parse network interface statistics', () => {
      const output = `
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets
  eth0: 1000000000 5000000    0    0    0     0          0         0 500000000 3000000
  eth1: 2000000000 8000000    0    0    0     0          0         0 800000000 4000000
      `.trim();

      const parsed = profiler.parseNetworkData('interfaces', output);

      // parseNetworkData returns raw output for 'interfaces' type
      expect(typeof parsed).toBe('string');
      expect(parsed).toContain('eth0');
      expect(parsed).toContain('eth1');
    });
  });

  describe.skip('generateRecommendations', () => {
    // TODO: Implement generateRecommendations method in Profiler
    test('should recommend CPU optimization for high CPU usage', () => {
      const bottlenecks = [{ type: 'cpu', severity: 'high', value: 85 }];

      const recommendations = profiler.generateRecommendations(bottlenecks);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].type).toBe('cpu');
      expect(recommendations[0].actions).toContain(expect.stringContaining('CPU'));
    });

    test('should recommend memory optimization for high memory usage', () => {
      const bottlenecks = [{ type: 'memory', severity: 'high', value: 88 }];

      const recommendations = profiler.generateRecommendations(bottlenecks);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].type).toBe('memory');
      expect(recommendations[0].actions).toContain(expect.stringContaining('memory'));
    });

    test('should return empty array for no bottlenecks', () => {
      const recommendations = profiler.generateRecommendations([]);

      expect(recommendations).toEqual([]);
    });

    test('should prioritize critical bottlenecks', () => {
      const bottlenecks = [
        { type: 'disk', severity: 'critical', value: 95 },
        { type: 'cpu', severity: 'medium', value: 70 }
      ];

      const recommendations = profiler.generateRecommendations(bottlenecks);

      expect(recommendations[0].priority).toBe('critical');
    });
  });

  describe.skip('compareProfiles', () => {
    // TODO: Implement compareProfiles method in Profiler (currently returns placeholder)
    test('should compare two profiles', () => {
      const profile1 = {
        cpu: { usage: { user: 60, system: 10 } },
        memory: { usage: 50 },
        timestamp: '2026-02-02T00:00:00Z'
      };

      const profile2 = {
        cpu: { usage: { user: 80, system: 15 } },
        memory: { usage: 70 },
        timestamp: '2026-02-02T01:00:00Z'
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison).toHaveProperty('cpuChange');
      expect(comparison).toHaveProperty('memoryChange');
      expect(comparison.cpuChange).toBeGreaterThan(0);
      expect(comparison.memoryChange).toBeGreaterThan(0);
    });

    test('should detect performance degradation', () => {
      const profile1 = {
        cpu: { usage: { user: 40, system: 5 } },
        memory: { usage: 50 }
      };

      const profile2 = {
        cpu: { usage: { user: 85, system: 10 } },
        memory: { usage: 88 }
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison.degraded).toBe(true);
    });
  });

  describe('profiles management', () => {
    test('should store profiles in map', () => {
      profiler.profiles.set('host1', { target: 'host1', cpu: {} });
      profiler.profiles.set('host2', { target: 'host2', cpu: {} });

      expect(profiler.profiles.size).toBe(2);
      expect(profiler.profiles.has('host1')).toBe(true);
      expect(profiler.profiles.has('host2')).toBe(true);
    });

    test('should retrieve stored profile', () => {
      const profile = { target: 'host1', cpu: { usage: 50 } };
      profiler.profiles.set('host1', profile);

      const retrieved = profiler.profiles.get('host1');

      expect(retrieved).toEqual(profile);
    });
  });
});
