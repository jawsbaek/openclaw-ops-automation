/**
 * Tests for Profiler
 * @fileoverview Unit tests for system profiling and bottleneck detection
 */

import Profiler from '../../../src/diagnostic/profiler.js';

// Test constants for metrics thresholds
const HIGH_CPU_USAGE = 85;
const NORMAL_CPU_USAGE = 40;
const NORMAL_MEMORY_USAGE = 50;
const HIGH_MEMORY_USAGE = 88;
const CRITICAL_DISK_USAGE = 92;
const NORMAL_DISK_USAGE = 60;
const NORMAL_CONNECTION_COUNT = 100;

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
        cpu: { usage: { usage: HIGH_CPU_USAGE } },
        memory: { summary: { usagePercent: NORMAL_MEMORY_USAGE } },
        disk: { usage: [] },
        network: { establishedConnections: NORMAL_CONNECTION_COUNT }
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
        cpu: { usage: { usage: NORMAL_CPU_USAGE } },
        memory: { summary: { usagePercent: HIGH_MEMORY_USAGE } },
        disk: { usage: [] },
        network: { establishedConnections: NORMAL_CONNECTION_COUNT }
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
        cpu: { usage: { usage: NORMAL_CPU_USAGE } },
        memory: { summary: { usagePercent: NORMAL_MEMORY_USAGE } },
        disk: { usage: [{ mountPoint: '/', usePercent: `${CRITICAL_DISK_USAGE}%` }] },
        network: { establishedConnections: NORMAL_CONNECTION_COUNT }
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
        cpu: { usage: { usage: NORMAL_CPU_USAGE } },
        memory: { summary: { usagePercent: NORMAL_MEMORY_USAGE } },
        disk: { usage: [{ mountPoint: '/', usePercent: `${NORMAL_DISK_USAGE}%` }] },
        network: { establishedConnections: NORMAL_CONNECTION_COUNT }
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

  describe('generateRecommendations', () => {
    test('should return error when profile is not provided', () => {
      const result = profiler.generateRecommendations(null);

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Profile is required for generating recommendations');
    });

    test('should recommend CPU optimization for high CPU usage', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 85 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result).toHaveProperty('recommendations');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].category).toBe('cpu');
      expect(result.recommendations[0].severity).toBe('high');
    });

    test('should recommend critical actions for very high CPU usage', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 92 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.critical).toBeGreaterThan(0);
      expect(result.recommendations[0].severity).toBe('critical');
    });

    test('should recommend memory optimization for high memory usage', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 85, used: 8000, topProcesses: [] } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.category === 'memory')).toBe(true);
    });

    test('should recommend disk cleanup for high disk usage', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 30 } },
        memory: { summary: { usagePercent: 50 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '92%' }] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.category === 'disk')).toBe(true);
    });

    test('should return empty recommendations for healthy profile', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 30 } },
        memory: { summary: { usagePercent: 40 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '50%' }] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.recommendations).toEqual([]);
      expect(result.totalRecommendations).toBe(0);
    });

    test('should prioritize recommendations by priority field', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 95 } },
        memory: { summary: { usagePercent: 92 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '97%' }] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.recommendations[0].priority).toBe(1);
    });

    test('should include bottleneck-based recommendations', () => {
      const profile = {
        target: 'test-host',
        cpu: { usage: { usage: 30 } },
        memory: { summary: { usagePercent: 40 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: [{ type: 'custom', severity: 'high', recommendation: 'Custom recommendation' }]
      };

      const result = profiler.generateRecommendations(profile);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.category === 'general')).toBe(true);
    });
  });

  describe('compareProfiles', () => {
    test('should return error when profiles are not provided', () => {
      const result = profiler.compareProfiles(null, null);

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Both profiles are required for comparison');
    });

    test('should return error when first profile is missing', () => {
      const profile2 = { target: 'test-host', timestamp: '2026-02-02T01:00:00Z' };

      const result = profiler.compareProfiles(null, profile2);

      expect(result).toHaveProperty('error');
    });

    test('should compare CPU usage between two profiles', () => {
      const profile1 = {
        target: 'test-host',
        timestamp: '2026-02-02T00:00:00Z',
        cpu: { usage: { usage: 40 }, loadAverage: { '1min': 1.0, '5min': 0.8 } },
        memory: { summary: { usagePercent: 50, used: 4000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const profile2 = {
        target: 'test-host',
        timestamp: '2026-02-02T01:00:00Z',
        cpu: { usage: { usage: 70 }, loadAverage: { '1min': 2.0, '5min': 1.5 } },
        memory: { summary: { usagePercent: 60, used: 5000 } },
        disk: { usage: [] },
        network: { establishedConnections: 150 },
        bottlenecks: []
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison).toHaveProperty('changes');
      expect(comparison.changes).toHaveProperty('cpu');
      expect(comparison.changes.cpu.usage.before).toBe(40);
      expect(comparison.changes.cpu.usage.after).toBe(70);
      expect(comparison.changes.cpu.usage.delta).toBe(30);
      expect(comparison.changes.cpu.usage.trend).toBe('increasing');
    });

    test('should compare memory usage between two profiles', () => {
      const profile1 = {
        target: 'test-host',
        timestamp: '2026-02-02T00:00:00Z',
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50, used: 4000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const profile2 = {
        target: 'test-host',
        timestamp: '2026-02-02T01:00:00Z',
        cpu: { usage: { usage: 45 } },
        memory: { summary: { usagePercent: 70, used: 6000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison.changes).toHaveProperty('memory');
      expect(comparison.changes.memory.usage.before).toBe(50);
      expect(comparison.changes.memory.usage.after).toBe(70);
      expect(comparison.changes.memory.usage.trend).toBe('increasing');
    });

    test('should compare disk usage between two profiles', () => {
      const profile1 = {
        target: 'test-host',
        timestamp: '2026-02-02T00:00:00Z',
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50, used: 4000 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '60%' }] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const profile2 = {
        target: 'test-host',
        timestamp: '2026-02-02T01:00:00Z',
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50, used: 4000 } },
        disk: { usage: [{ mountPoint: '/', usePercent: '75%' }] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison.changes).toHaveProperty('disk');
      expect(comparison.changes.disk).toBeInstanceOf(Array);
      expect(comparison.changes.disk[0].mountPoint).toBe('/');
      expect(comparison.changes.disk[0].before).toBe(60);
      expect(comparison.changes.disk[0].after).toBe(75);
      expect(comparison.changes.disk[0].trend).toBe('increasing');
    });

    test('should detect stable metrics (no significant change)', () => {
      const profile1 = {
        target: 'test-host',
        timestamp: '2026-02-02T00:00:00Z',
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 60, used: 5000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const profile2 = {
        target: 'test-host',
        timestamp: '2026-02-02T01:00:00Z',
        cpu: { usage: { usage: 52 } },
        memory: { summary: { usagePercent: 62, used: 5200 } },
        disk: { usage: [] },
        network: { establishedConnections: 105 },
        bottlenecks: []
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison.changes.cpu.usage.trend).toBe('stable');
      expect(comparison.changes.memory.usage.trend).toBe('stable');
    });

    test('should track bottleneck changes', () => {
      const profile1 = {
        target: 'test-host',
        timestamp: '2026-02-02T00:00:00Z',
        cpu: { usage: { usage: 50 } },
        memory: { summary: { usagePercent: 60, used: 5000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: [{ type: 'cpu', severity: 'high' }]
      };

      const profile2 = {
        target: 'test-host',
        timestamp: '2026-02-02T01:00:00Z',
        cpu: { usage: { usage: 40 } },
        memory: { summary: { usagePercent: 50, used: 4000 } },
        disk: { usage: [] },
        network: { establishedConnections: 100 },
        bottlenecks: []
      };

      const comparison = profiler.compareProfiles(profile1, profile2);

      expect(comparison).toHaveProperty('bottleneckChanges');
      expect(comparison.bottleneckChanges.before).toBe(1);
      expect(comparison.bottleneckChanges.after).toBe(0);
      expect(comparison.bottleneckChanges.resolved.length).toBe(1);
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
