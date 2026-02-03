import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockExecAsync = vi.fn();

vi.mock('node:child_process', () => ({
  exec: vi.fn()
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync
}));

const mockMemory = {
  total: 16 * 1024 * 1024 * 1024,
  free: 8 * 1024 * 1024 * 1024,
  shouldThrow: false
};

vi.mock('node:os', () => ({
  default: {
    totalmem: () => {
      if (mockMemory.shouldThrow) throw new Error('Memory read error');
      return mockMemory.total;
    },
    freemem: () => mockMemory.free
  },
  totalmem: () => {
    if (mockMemory.shouldThrow) throw new Error('Memory read error');
    return mockMemory.total;
  },
  freemem: () => mockMemory.free
}));

vi.mock('axios');

const mockLoadMonitoringSources = vi.fn();
const mockSaveMetrics = vi.fn();
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../lib/config-loader.js', () => ({
  loadMonitoringSources: () => mockLoadMonitoringSources()
}));

vi.mock('../../lib/file-utils.js', () => ({
  saveMetrics: (data) => mockSaveMetrics(data)
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => mockLogger
}));

const axios = (await import('axios')).default;
const { collectMetrics } = await import('../../workers/metrics-collector.js');

describe('Metrics Collector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMemory.total = 16 * 1024 * 1024 * 1024;
    mockMemory.free = 8 * 1024 * 1024 * 1024;
    mockMemory.shouldThrow = false;

    mockExecAsync.mockImplementation((cmd) => {
      if (cmd.includes('top')) {
        return Promise.resolve({ stdout: '45.5\n', stderr: '' });
      }
      if (cmd.includes('df')) {
        return Promise.resolve({ stdout: '50% /dev/sda1 /\n75% /dev/sdb1 /home\n', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    mockLoadMonitoringSources.mockReturnValue({
      healthchecks: [],
      prometheus: null
    });
    mockSaveMetrics.mockReturnValue('/path/to/metrics.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('collectMetrics', () => {
    test('returns a valid metrics object', async () => {
      const metrics = await collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('system');
      expect(metrics).toHaveProperty('collector');
    });

    test('metrics object has system data', async () => {
      const metrics = await collectMetrics();

      expect(metrics.system).toHaveProperty('cpu');
      expect(metrics.system).toHaveProperty('memory');
      expect(metrics.system).toHaveProperty('disk');

      expect(typeof metrics.system.cpu).toBe('number');
      expect(typeof metrics.system.memory).toBe('object');
    });

    test('timestamp is valid ISO string', async () => {
      const metrics = await collectMetrics();

      const timestamp = new Date(metrics.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
      expect(metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('collector metadata is present', async () => {
      const metrics = await collectMetrics();

      expect(metrics.collector).toHaveProperty('version');
      expect(typeof metrics.collector.version).toBe('string');
    });

    test('saves metrics to file', async () => {
      await collectMetrics();

      expect(mockSaveMetrics).toHaveBeenCalled();
      const savedMetrics = mockSaveMetrics.mock.calls[0][0];
      expect(savedMetrics).toHaveProperty('timestamp');
      expect(savedMetrics).toHaveProperty('system');
    });
  });

  describe('CPU collection', () => {
    test('parses CPU percentage correctly', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('top')) {
          return Promise.resolve({ stdout: '45.5\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();
      expect(metrics.system.cpu).toBe(45.5);
    });

    test('handles CPU command failure gracefully', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('top')) {
          return Promise.reject(new Error('Command not found'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.system.cpu).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to collect CPU metrics, using fallback', expect.any(Object));
    });

    test('handles empty CPU output', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('top')) {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();
      expect(metrics.system.cpu).toBe(0);
    });

    test('handles non-numeric CPU output', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('top')) {
          return Promise.resolve({ stdout: 'not a number\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();
      expect(metrics.system.cpu).toBe(0);
    });
  });

  describe('Memory collection', () => {
    test('collects memory statistics', async () => {
      const metrics = await collectMetrics();

      expect(metrics.system.memory).toHaveProperty('total');
      expect(metrics.system.memory).toHaveProperty('used');
      expect(metrics.system.memory).toHaveProperty('free');
      expect(metrics.system.memory).toHaveProperty('percentage');
      expect(metrics.system.memory.percentage).toBe(50);
    });

    test('handles zero total memory edge case', async () => {
      mockMemory.total = 0;
      mockMemory.free = 0;

      const metrics = await collectMetrics();

      expect(metrics.system.memory.percentage).toBe(0);
    });

    test('handles memory collection error', async () => {
      mockMemory.shouldThrow = true;

      const metrics = await collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.system.memory).toEqual({ total: 0, used: 0, free: 0, percentage: 0 });
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to collect memory metrics', expect.any(Object));
    });

    test('calculates memory percentage correctly', async () => {
      mockMemory.total = 100;
      mockMemory.free = 25;

      const metrics = await collectMetrics();

      expect(metrics.system.memory.total).toBe(100);
      expect(metrics.system.memory.free).toBe(25);
      expect(metrics.system.memory.used).toBe(75);
      expect(metrics.system.memory.percentage).toBe(75);
    });
  });

  describe('Disk collection', () => {
    test('parses disk usage correctly', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('df')) {
          return Promise.resolve({ stdout: '50% /dev/sda1 /\n75% /dev/sdb1 /home\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();

      expect(Array.isArray(metrics.system.disk)).toBe(true);
      expect(metrics.system.disk.length).toBe(2);
      expect(metrics.system.disk[0]).toHaveProperty('device');
      expect(metrics.system.disk[0]).toHaveProperty('mount');
      expect(metrics.system.disk[0]).toHaveProperty('percentage');
      expect(metrics.system.disk[0].percentage).toBe(50);
      expect(metrics.system.disk[1].percentage).toBe(75);
    });

    test('handles disk command failure', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('df')) {
          return Promise.reject(new Error('Command failed'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();

      expect(metrics.system.disk).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to collect disk metrics', expect.any(Object));
    });

    test('handles empty disk output', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('df')) {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const metrics = await collectMetrics();

      expect(Array.isArray(metrics.system.disk)).toBe(true);
    });
  });

  describe('Health checks', () => {
    test('returns empty array when no healthchecks configured', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: null
      });

      const metrics = await collectMetrics();

      expect(metrics.healthchecks).toEqual([]);
    });

    test('returns empty array when healthchecks is null', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: null,
        prometheus: null
      });

      const metrics = await collectMetrics();

      expect(metrics.healthchecks).toEqual([]);
    });

    test('checks healthy endpoints', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [
          { name: 'API', url: 'http://localhost:8080/health' },
          { name: 'DB', url: 'http://localhost:5432/health' }
        ],
        prometheus: null
      });

      axios.get.mockResolvedValue({
        status: 200,
        data: { status: 'ok' }
      });

      const metrics = await collectMetrics();

      expect(metrics.healthchecks.length).toBe(2);
      expect(metrics.healthchecks[0]).toHaveProperty('name', 'API');
      expect(metrics.healthchecks[0]).toHaveProperty('status', 'healthy');
      expect(metrics.healthchecks[0]).toHaveProperty('statusCode', 200);
      expect(metrics.healthchecks[0]).toHaveProperty('latency');
      expect(metrics.healthchecks[0]).toHaveProperty('timestamp');
    });

    test('handles unhealthy endpoints', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080/health' }],
        prometheus: null
      });

      axios.get.mockRejectedValue(new Error('Connection refused'));

      const metrics = await collectMetrics();

      expect(metrics.healthchecks.length).toBe(1);
      expect(metrics.healthchecks[0]).toHaveProperty('name', 'API');
      expect(metrics.healthchecks[0]).toHaveProperty('status', 'unhealthy');
      expect(metrics.healthchecks[0]).toHaveProperty('error', 'Connection refused');
      expect(metrics.healthchecks[0]).toHaveProperty('latency');
      expect(metrics.healthchecks[0]).toHaveProperty('timestamp');
    });

    test('handles mixed healthy and unhealthy endpoints', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [
          { name: 'API', url: 'http://localhost:8080/health' },
          { name: 'DB', url: 'http://localhost:5432/health' }
        ],
        prometheus: null
      });

      axios.get.mockResolvedValueOnce({ status: 200, data: {} }).mockRejectedValueOnce(new Error('Timeout'));

      const metrics = await collectMetrics();

      expect(metrics.healthchecks.length).toBe(2);
      expect(metrics.healthchecks[0].status).toBe('healthy');
      expect(metrics.healthchecks[1].status).toBe('unhealthy');
    });

    test('healthcheck latency is recorded', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080/health' }],
        prometheus: null
      });

      axios.get.mockResolvedValue({ status: 200, data: {} });

      const metrics = await collectMetrics();

      expect(typeof metrics.healthchecks[0].latency).toBe('number');
      expect(metrics.healthchecks[0].latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Prometheus querying', () => {
    test('returns null when prometheus is not enabled', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: null
      });

      const metrics = await collectMetrics();

      expect(metrics.prometheus).toBeNull();
    });

    test('returns null when prometheus is disabled', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: { enabled: false }
      });

      const metrics = await collectMetrics();

      expect(metrics.prometheus).toBeNull();
    });

    test('queries prometheus successfully', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {
            cpu: 'rate(node_cpu_seconds_total[5m])',
            memory: 'node_memory_MemAvailable_bytes'
          }
        }
      });

      axios.get.mockResolvedValue({
        data: {
          data: {
            result: [{ metric: {}, value: [1234567890, '0.75'] }]
          }
        }
      });

      const metrics = await collectMetrics();

      expect(metrics.prometheus).not.toBeNull();
      expect(metrics.prometheus).toHaveProperty('cpu');
      expect(metrics.prometheus).toHaveProperty('memory');
      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:9090/api/v1/query',
        expect.objectContaining({
          params: { query: 'rate(node_cpu_seconds_total[5m])' },
          timeout: 5000
        })
      );
    });

    test('handles prometheus query failure for individual metric', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {
            cpu: 'rate(node_cpu_seconds_total[5m])',
            memory: 'node_memory_MemAvailable_bytes'
          }
        }
      });

      axios.get
        .mockResolvedValueOnce({
          data: { data: { result: [{ value: '0.5' }] } }
        })
        .mockRejectedValueOnce(new Error('Query timeout'));

      const metrics = await collectMetrics();

      expect(metrics.prometheus).not.toBeNull();
      expect(metrics.prometheus.cpu).toBeDefined();
      expect(metrics.prometheus.memory).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to query Prometheus'),
        expect.any(Object)
      );
    });

    test('handles prometheus complete failure', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {
            cpu: 'rate(node_cpu_seconds_total[5m])'
          }
        }
      });

      axios.get.mockRejectedValue(new Error('Connection refused'));

      const metrics = await collectMetrics();

      expect(metrics.prometheus).not.toBeNull();
      expect(metrics.prometheus.cpu).toBeNull();
    });

    test('handles empty queries object', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {}
        }
      });

      const metrics = await collectMetrics();

      expect(metrics.prometheus).toEqual({});
    });

    test('handles undefined queries', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090'
        }
      });

      const metrics = await collectMetrics();

      expect(metrics.prometheus).toEqual({});
    });

    test('queries multiple prometheus metrics', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {
            cpu: 'up',
            memory: 'node_memory_total',
            disk: 'node_filesystem_size'
          }
        }
      });

      axios.get.mockResolvedValue({
        data: { data: { result: [{ value: '1' }] } }
      });

      const metrics = await collectMetrics();

      expect(axios.get).toHaveBeenCalledTimes(3);
      expect(metrics.prometheus.cpu).toBeDefined();
      expect(metrics.prometheus.memory).toBeDefined();
      expect(metrics.prometheus.disk).toBeDefined();
    });
  });

  describe('Full collection integration', () => {
    test('collects all metrics types together', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080/health' }],
        prometheus: {
          enabled: true,
          endpoint: 'http://localhost:9090',
          queries: {
            custom: 'up'
          }
        }
      });

      axios.get.mockResolvedValue({
        status: 200,
        data: { data: { result: [] } }
      });

      const metrics = await collectMetrics();

      expect(metrics.timestamp).toBeDefined();
      expect(metrics.system.cpu).toBeDefined();
      expect(metrics.system.memory).toBeDefined();
      expect(metrics.system.disk).toBeDefined();
      expect(metrics.healthchecks.length).toBe(1);
      expect(metrics.prometheus).toBeDefined();
      expect(metrics.collector.version).toBe('1.0.0');
    });

    test('returns valid metrics when all external calls fail', async () => {
      mockExecAsync.mockRejectedValue(new Error('Command failed'));
      mockMemory.shouldThrow = true;

      mockLoadMonitoringSources.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://fail' }],
        prometheus: { enabled: true, endpoint: 'http://fail', queries: { test: 'up' } }
      });

      axios.get.mockRejectedValue(new Error('Network error'));

      const metrics = await collectMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.system).toBeDefined();
      expect(metrics.collector).toBeDefined();
      expect(metrics.healthchecks[0].status).toBe('unhealthy');
      expect(metrics.prometheus.test).toBeNull();
    });

    test('collector duration is set to zero', async () => {
      const metrics = await collectMetrics();
      expect(metrics.collector.duration).toBe(0);
    });

    test('calls saveMetrics with correct data', async () => {
      await collectMetrics();

      expect(mockSaveMetrics).toHaveBeenCalledTimes(1);
      const savedData = mockSaveMetrics.mock.calls[0][0];
      expect(savedData).toHaveProperty('timestamp');
      expect(savedData).toHaveProperty('system');
      expect(savedData).toHaveProperty('healthchecks');
      expect(savedData).toHaveProperty('prometheus');
      expect(savedData).toHaveProperty('collector');
    });

    test('logs metrics collection start', async () => {
      await collectMetrics();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting metrics collection');
    });

    test('logs metrics collection success', async () => {
      await collectMetrics();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Metrics collected successfully',
        expect.objectContaining({
          filepath: expect.any(String),
          cpu: expect.any(Number),
          memory: expect.any(Number)
        })
      );
    });
  });
});
