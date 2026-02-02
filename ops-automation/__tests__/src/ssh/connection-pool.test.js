import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let mockClientInstances = [];

class MockClient {
  constructor() {
    this.connect = vi.fn();
    this.end = vi.fn();
    this._handlers = {};
    mockClientInstances.push(this);
  }

  on(event, handler) {
    this._handlers[event] = handler;
    return this;
  }
}

vi.mock('ssh2', () => ({
  Client: MockClient
}));

vi.mock('../../../lib/logger.js', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

const { default: SSHConnectionPool } = await import('../../../src/ssh/connection-pool.js');

describe('SSHConnectionPool', () => {
  let pool;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClientInstances = [];
    pool = new SSHConnectionPool({
      maxConnections: 10,
      idleTimeout: 60000,
      connectTimeout: 5000
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    if (pool) {
      pool.closeAll();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    test('initializes with default options', () => {
      const defaultPool = new SSHConnectionPool();
      expect(defaultPool.maxConnections).toBe(50);
      expect(defaultPool.idleTimeout).toBe(300000);
      expect(defaultPool.connectTimeout).toBe(10000);
      expect(defaultPool.connections.size).toBe(0);
      defaultPool.closeAll();
    });

    test('initializes with custom options', () => {
      expect(pool.maxConnections).toBe(10);
      expect(pool.idleTimeout).toBe(60000);
      expect(pool.connectTimeout).toBe(5000);
    });

    test('initializes stats', () => {
      expect(pool.stats).toEqual({
        totalConnections: 0,
        activeConnections: 0,
        failedConnections: 0
      });
    });

    test('extends EventEmitter', () => {
      expect(typeof pool.on).toBe('function');
      expect(typeof pool.emit).toBe('function');
    });

    test('starts cleanup interval', () => {
      expect(pool.cleanupInterval).toBeDefined();
    });
  });

  describe('getConnectionKey', () => {
    test('normalizes host to lowercase', () => {
      expect(pool.getConnectionKey('SERVER1.example.com')).toBe('server1.example.com');
      expect(pool.getConnectionKey('Server2')).toBe('server2');
    });
  });

  describe('getConnection', () => {
    test('reuses existing idle connection', async () => {
      const mockClient = { end: vi.fn() };
      pool.connections.set('server1', {
        client: mockClient,
        inUse: false,
        lastUsed: Date.now() - 1000
      });

      const result = await pool.getConnection('server1', {});

      expect(result).toBe(mockClient);
      expect(pool.connections.get('server1').inUse).toBe(true);
    });

    test('creates new connection when none exists', async () => {
      const config = {
        host: 'server1',
        username: 'admin',
        privateKey: 'key'
      };

      const connectionPromise = pool.getConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      const mockInstance = mockClientInstances[0];
      mockInstance._handlers.ready?.();

      const result = await connectionPromise;

      expect(result).toBe(mockInstance);
      expect(pool.connections.has('server1')).toBe(true);
    });

    test('throws error when max connections exceeded', async () => {
      pool.maxConnections = 2;

      for (let i = 0; i < 2; i++) {
        pool.connections.set(`server${i}`, {
          client: { end: vi.fn() },
          inUse: true
        });
      }

      await expect(pool.getConnection('server3', {})).rejects.toThrow('최대 SSH 연결 수 초과');
    });

    test('does not reuse connection in use', async () => {
      const existingClient = { end: vi.fn() };
      pool.connections.set('server1', {
        client: existingClient,
        inUse: true,
        lastUsed: Date.now()
      });

      pool.maxConnections = 2;

      const connectionPromise = pool.getConnection('server1', { username: 'admin' });

      await vi.advanceTimersByTimeAsync(10);
      const newInstance = mockClientInstances[0];
      newInstance._handlers.ready?.();

      const result = await connectionPromise;

      expect(result).toBe(newInstance);
    });
  });

  describe('createConnection', () => {
    test('creates connection successfully', async () => {
      const config = {
        host: 'server1',
        port: 22,
        username: 'admin',
        privateKey: 'key'
      };

      const connectionPromise = pool.createConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      const mockInstance = mockClientInstances[0];
      mockInstance._handlers.ready?.();

      const result = await connectionPromise;

      expect(result).toBe(mockInstance);
      expect(pool.stats.totalConnections).toBe(1);
      expect(pool.stats.activeConnections).toBe(1);
    });

    test('stores connection metadata', async () => {
      const config = { username: 'admin' };

      const connectionPromise = pool.createConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();

      await connectionPromise;

      const conn = pool.connections.get('server1');
      expect(conn.host).toBe('server1');
      expect(conn.inUse).toBe(true);
      expect(conn.lastUsed).toBeDefined();
      expect(conn.createdAt).toBeDefined();
    });

    test('emits connected event on success', async () => {
      const connectedHandler = vi.fn();
      pool.on('connected', connectedHandler);

      const connectionPromise = pool.createConnection('server1', { username: 'admin' });

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();

      await connectionPromise;

      expect(connectedHandler).toHaveBeenCalledWith('server1');
    });

    test('rejects on connection error', async () => {
      pool.on('error', () => {});
      const config = { username: 'admin' };
      const connectionPromise = pool.createConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      const mockInstance = mockClientInstances[0];
      mockInstance._handlers.error?.(new Error('Connection refused'));

      await expect(connectionPromise).rejects.toThrow('Connection refused');
      expect(pool.stats.failedConnections).toBe(1);

      vi.clearAllTimers();
    });

    test('emits error event on failure', async () => {
      const errorHandler = vi.fn();
      pool.on('error', errorHandler);

      const connectionPromise = pool.createConnection('server1', { username: 'admin' });

      await vi.advanceTimersByTimeAsync(10);
      const err = new Error('Connection refused');
      mockClientInstances[0]._handlers.error?.(err);

      await expect(connectionPromise).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith({ host: 'server1', error: err });
      vi.clearAllTimers();
    });

    test('rejects on timeout', async () => {
      const config = { username: 'admin' };
      const connectionPromise = pool.createConnection('server1', config);

      const rejectionPromise = expect(connectionPromise).rejects.toThrow('SSH 연결 타임아웃');
      await vi.advanceTimersByTimeAsync(5001);
      await rejectionPromise;
      vi.clearAllTimers();
    });

    test('calls client.connect with correct config', async () => {
      const config = {
        host: 'example.com',
        port: 2222,
        username: 'admin',
        privateKey: 'private-key-content'
      };

      const connectionPromise = pool.createConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();
      await connectionPromise;

      expect(mockClientInstances[0].connect).toHaveBeenCalledWith({
        host: 'example.com',
        port: 2222,
        username: 'admin',
        privateKey: 'private-key-content',
        readyTimeout: 5000
      });
    });

    test('uses default port 22 when not specified', async () => {
      const config = { username: 'admin' };

      const connectionPromise = pool.createConnection('server1', config);

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();
      await connectionPromise;

      expect(mockClientInstances[0].connect).toHaveBeenCalledWith(expect.objectContaining({ port: 22 }));
    });

    test('uses host as fallback when config.host not specified', async () => {
      const config = { username: 'admin' };

      const connectionPromise = pool.createConnection('myserver', config);

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();
      await connectionPromise;

      expect(mockClientInstances[0].connect).toHaveBeenCalledWith(expect.objectContaining({ host: 'myserver' }));
    });

    test('handles close event and removes connection', async () => {
      const closedHandler = vi.fn();
      pool.on('closed', closedHandler);

      const connectionPromise = pool.createConnection('server1', { username: 'admin' });

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();
      await connectionPromise;

      expect(pool.connections.has('server1')).toBe(true);
      pool.stats.activeConnections = 1;

      mockClientInstances[0]._handlers.close?.();

      expect(pool.connections.has('server1')).toBe(false);
      expect(pool.stats.activeConnections).toBe(0);
      expect(closedHandler).toHaveBeenCalledWith('server1');
    });

    test('close event does nothing if connection already removed', async () => {
      const connectionPromise = pool.createConnection('server1', { username: 'admin' });

      await vi.advanceTimersByTimeAsync(10);
      mockClientInstances[0]._handlers.ready?.();
      await connectionPromise;

      pool.connections.delete('server1');

      expect(() => mockClientInstances[0]._handlers.close?.()).not.toThrow();
    });
  });

  describe('releaseConnection', () => {
    test('marks connection as not in use', () => {
      const conn = {
        client: { end: vi.fn() },
        host: 'server1',
        inUse: true,
        lastUsed: Date.now() - 10000
      };
      pool.connections.set('server1', conn);

      pool.releaseConnection('server1');

      expect(conn.inUse).toBe(false);
      expect(conn.lastUsed).toBeGreaterThan(Date.now() - 100);
    });

    test('handles non-existent connection gracefully', () => {
      expect(() => pool.releaseConnection('nonexistent')).not.toThrow();
    });
  });

  describe('closeConnection', () => {
    test('closes and removes specific connection', () => {
      const mockEnd = vi.fn();
      const conn = {
        client: { end: mockEnd },
        host: 'server1',
        inUse: false
      };
      pool.connections.set('server1', conn);
      pool.stats.activeConnections = 1;

      pool.closeConnection('server1');

      expect(mockEnd).toHaveBeenCalled();
      expect(pool.connections.has('server1')).toBe(false);
      expect(pool.stats.activeConnections).toBe(0);
    });

    test('handles closing non-existent connection', () => {
      expect(() => pool.closeConnection('nonexistent')).not.toThrow();
    });
  });

  describe('closeAll', () => {
    test('closes all connections', () => {
      const mockEnd1 = vi.fn();
      const mockEnd2 = vi.fn();

      pool.connections.set('server1', { client: { end: mockEnd1 } });
      pool.connections.set('server2', { client: { end: mockEnd2 } });
      pool.stats.activeConnections = 2;

      pool.closeAll();

      expect(mockEnd1).toHaveBeenCalled();
      expect(mockEnd2).toHaveBeenCalled();
      expect(pool.connections.size).toBe(0);
      expect(pool.stats.activeConnections).toBe(0);
    });

    test('clears cleanup interval', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      pool.closeAll();

      expect(clearIntervalSpy).toHaveBeenCalledWith(pool.cleanupInterval);
    });
  });

  describe('cleanup', () => {
    test('removes idle connections', () => {
      const now = Date.now();
      const mockEnd1 = vi.fn();
      const mockEnd2 = vi.fn();

      pool.connections.set('server1', {
        client: { end: mockEnd1 },
        inUse: false,
        lastUsed: now - 100000
      });

      pool.connections.set('server2', {
        client: { end: mockEnd2 },
        inUse: false,
        lastUsed: now - 1000
      });

      pool.stats.activeConnections = 2;
      pool.cleanup();

      expect(mockEnd1).toHaveBeenCalled();
      expect(mockEnd2).not.toHaveBeenCalled();
      expect(pool.connections.has('server1')).toBe(false);
      expect(pool.connections.has('server2')).toBe(true);
      expect(pool.stats.activeConnections).toBe(1);
    });

    test('does not remove connections in use', () => {
      const mockEnd = vi.fn();
      const now = Date.now();

      pool.connections.set('server1', {
        client: { end: mockEnd },
        inUse: true,
        lastUsed: now - 100000
      });

      pool.cleanup();

      expect(mockEnd).not.toHaveBeenCalled();
      expect(pool.connections.has('server1')).toBe(true);
    });

    test('does not log when no connections cleaned', () => {
      pool.connections.set('server1', {
        client: { end: vi.fn() },
        inUse: false,
        lastUsed: Date.now()
      });

      pool.cleanup();

      expect(pool.connections.has('server1')).toBe(true);
    });

    test('runs automatically via interval', async () => {
      const mockEnd = vi.fn();
      pool.connections.set('server1', {
        client: { end: mockEnd },
        inUse: false,
        lastUsed: Date.now() - 100000
      });
      pool.stats.activeConnections = 1;

      await vi.advanceTimersByTimeAsync(60001);

      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    test('returns pool status', () => {
      const now = Date.now();
      const mockEnd = vi.fn();
      pool.connections.set('server1', {
        client: { end: mockEnd },
        host: 'server1',
        inUse: true,
        lastUsed: now - 5000,
        createdAt: now - 60000
      });

      pool.stats.totalConnections = 5;
      pool.stats.activeConnections = 1;
      pool.stats.failedConnections = 2;

      const status = pool.getStatus();

      expect(status.stats).toEqual({
        totalConnections: 5,
        activeConnections: 1,
        failedConnections: 2
      });
      expect(status.poolSize).toBe(1);
      expect(status.maxConnections).toBe(10);
      expect(status.connections).toHaveLength(1);
      expect(status.connections[0].host).toBe('server1');
      expect(status.connections[0].inUse).toBe(true);
    });

    test('returns empty status for new pool', () => {
      const status = pool.getStatus();

      expect(status.poolSize).toBe(0);
      expect(status.connections).toHaveLength(0);
      expect(status.stats.totalConnections).toBe(0);
    });

    test('calculates idleTime and uptime correctly', () => {
      const now = Date.now();
      pool.connections.set('server1', {
        client: { end: vi.fn() },
        host: 'server1',
        inUse: false,
        lastUsed: now - 5000,
        createdAt: now - 60000
      });

      const status = pool.getStatus();

      expect(status.connections[0].idleTime).toBeGreaterThanOrEqual(5000);
      expect(status.connections[0].uptime).toBeGreaterThanOrEqual(60000);
    });
  });
});
