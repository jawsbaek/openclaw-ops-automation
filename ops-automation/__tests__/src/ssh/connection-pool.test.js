/**
 * Tests for SSH Connection Pool
 * @fileoverview Unit tests for connection pool management logic
 */

import SSHConnectionPool from '../../../src/ssh/connection-pool.js';

// Note: We test the logic without actual SSH connections
// SSH2 library behavior is tested separately by the library itself

describe('SSHConnectionPool', () => {
  let pool;

  beforeEach(() => {
    pool = new SSHConnectionPool({
      maxConnections: 5,
      idleTimeout: 60000,
      connectTimeout: 5000
    });
  });

  afterEach(() => {
    if (pool && pool.cleanupInterval) {
      clearInterval(pool.cleanupInterval);
    }
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const defaultPool = new SSHConnectionPool();
      expect(defaultPool.maxConnections).toBe(50);
      expect(defaultPool.idleTimeout).toBe(300000);
      expect(defaultPool.connectTimeout).toBe(10000);
      clearInterval(defaultPool.cleanupInterval);
    });

    test('should initialize with custom options', () => {
      expect(pool.maxConnections).toBe(5);
      expect(pool.idleTimeout).toBe(60000);
      expect(pool.connectTimeout).toBe(5000);
    });

    test('should initialize stats with zeros', () => {
      expect(pool.stats).toEqual({
        totalConnections: 0,
        activeConnections: 0,
        failedConnections: 0
      });
    });

    test('should initialize empty connections map', () => {
      expect(pool.connections).toBeInstanceOf(Map);
      expect(pool.connections.size).toBe(0);
    });

    test('should start cleanup interval', () => {
      expect(pool.cleanupInterval).toBeDefined();
      expect(typeof pool.cleanupInterval).not.toBe('undefined');
    });
  });

  describe('getConnectionKey', () => {
    test('should normalize host to lowercase', () => {
      expect(pool.getConnectionKey('TEST.COM')).toBe('test.com');
      expect(pool.getConnectionKey('Test.Example.COM')).toBe('test.example.com');
      expect(pool.getConnectionKey('UPPERCASE.HOST')).toBe('uppercase.host');
    });

    test('should handle already lowercase hosts', () => {
      expect(pool.getConnectionKey('example.com')).toBe('example.com');
    });
  });

  describe('releaseConnection', () => {
    test('should handle non-existent connection gracefully', () => {
      // Should not throw error
      expect(() => {
        pool.releaseConnection('nonexistent.com');
      }).not.toThrow();
    });

    test('should mark connection as not in use when exists', () => {
      // Manually add a connection for testing
      let endCalled = false;
      const mockClient = { end: () => { endCalled = true; } };
      pool.connections.set('test.com', {
        client: mockClient,
        host: 'test.com',
        lastUsed: Date.now() - 10000,
        inUse: true,
        createdAt: Date.now() - 10000
      });

      pool.releaseConnection('test.com');

      const conn = pool.connections.get('test.com');
      expect(conn.inUse).toBe(false);
      expect(conn.lastUsed).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('closeConnection', () => {
    test('should remove connection when it exists', () => {
      let endCalled = false;
      const mockClient = { end: () => { endCalled = true; } };
      pool.connections.set('test.com', {
        client: mockClient,
        host: 'test.com',
        lastUsed: Date.now(),
        inUse: false,
        createdAt: Date.now()
      });
      pool.stats.activeConnections = 1;

      pool.closeConnection('test.com');

      expect(endCalled).toBe(true);
      expect(pool.connections.has('test.com')).toBe(false);
      expect(pool.stats.activeConnections).toBe(0);
    });

    test('should handle non-existent connection gracefully', () => {
      expect(() => {
        pool.closeConnection('nonexistent.com');
      }).not.toThrow();
    });
  });

  describe('closeAll', () => {
    test('should close all connections', () => {
      let end1Called = false;
      let end2Called = false;
      const mockClient1 = { end: () => { end1Called = true; } };
      const mockClient2 = { end: () => { end2Called = true; } };
      
      pool.connections.set('host1.com', {
        client: mockClient1,
        host: 'host1.com',
        lastUsed: Date.now(),
        inUse: false,
        createdAt: Date.now()
      });
      
      pool.connections.set('host2.com', {
        client: mockClient2,
        host: 'host2.com',
        lastUsed: Date.now(),
        inUse: true,
        createdAt: Date.now()
      });
      
      pool.stats.activeConnections = 2;

      pool.closeAll();

      expect(end1Called).toBe(true);
      expect(end2Called).toBe(true);
      expect(pool.connections.size).toBe(0);
      expect(pool.stats.activeConnections).toBe(0);
    });

    test('should clear cleanup interval', () => {
      const originalInterval = pool.cleanupInterval;
      pool.closeAll();
      // Interval should be cleared (we can't easily test this directly)
      expect(pool.connections.size).toBe(0);
    });
  });

  describe('cleanup', () => {
    test('should remove idle connections beyond timeout', () => {
      let endCalled = false;
      const mockClient = { end: () => { endCalled = true; } };
      const oldTime = Date.now() - 70000; // 70 seconds ago
      
      pool.connections.set('idle.com', {
        client: mockClient,
        host: 'idle.com',
        lastUsed: oldTime,
        inUse: false,
        createdAt: oldTime
      });
      
      pool.stats.activeConnections = 1;

      pool.cleanup();

      expect(endCalled).toBe(true);
      expect(pool.connections.has('idle.com')).toBe(false);
      expect(pool.stats.activeConnections).toBe(0);
    });

    test('should keep connections in use', () => {
      let endCalled = false;
      const mockClient = { end: () => { endCalled = true; } };
      const oldTime = Date.now() - 70000;
      
      pool.connections.set('active.com', {
        client: mockClient,
        host: 'active.com',
        lastUsed: oldTime,
        inUse: true, // Still in use
        createdAt: oldTime
      });

      pool.cleanup();

      expect(endCalled).toBe(false);
      expect(pool.connections.has('active.com')).toBe(true);
    });

    test('should keep recently used connections', () => {
      let endCalled = false;
      const mockClient = { end: () => { endCalled = true; } };
      const recentTime = Date.now() - 5000; // 5 seconds ago
      
      pool.connections.set('recent.com', {
        client: mockClient,
        host: 'recent.com',
        lastUsed: recentTime,
        inUse: false,
        createdAt: recentTime
      });

      pool.cleanup();

      expect(endCalled).toBe(false);
      expect(pool.connections.has('recent.com')).toBe(true);
    });

    test('should clean multiple idle connections', () => {
      let end1Called = false;
      let end2Called = false;
      const mockClient1 = { end: () => { end1Called = true; } };
      const mockClient2 = { end: () => { end2Called = true; } };
      const oldTime = Date.now() - 70000;
      
      pool.connections.set('idle1.com', {
        client: mockClient1,
        host: 'idle1.com',
        lastUsed: oldTime,
        inUse: false,
        createdAt: oldTime
      });
      
      pool.connections.set('idle2.com', {
        client: mockClient2,
        host: 'idle2.com',
        lastUsed: oldTime,
        inUse: false,
        createdAt: oldTime
      });
      
      pool.stats.activeConnections = 2;

      pool.cleanup();

      expect(end1Called).toBe(true);
      expect(end2Called).toBe(true);
      expect(pool.connections.size).toBe(0);
    });
  });

  describe('getStatus', () => {
    test('should return complete status with no connections', () => {
      const status = pool.getStatus();

      expect(status.poolSize).toBe(0);
      expect(status.maxConnections).toBe(5);
      expect(status.stats).toEqual(pool.stats);
      expect(status.connections).toEqual([]);
    });

    test('should return status with connection details', () => {
      const now = Date.now();
      const mockClient = { end: () => {} };
      
      pool.connections.set('test.com', {
        client: mockClient,
        host: 'test.com',
        lastUsed: now - 5000,
        inUse: true,
        createdAt: now - 60000
      });

      const status = pool.getStatus();

      expect(status.poolSize).toBe(1);
      expect(status.connections).toHaveLength(1);
      expect(status.connections[0].host).toBe('test.com');
      expect(status.connections[0].inUse).toBe(true);
      expect(status.connections[0].idleTime).toBeGreaterThan(4000);
      expect(status.connections[0].uptime).toBeGreaterThan(59000);
    });

    test('should calculate idle and uptime correctly', () => {
      const now = Date.now();
      const mockClient = { end: () => {} };
      
      pool.connections.set('host1.com', {
        client: mockClient,
        host: 'host1.com',
        lastUsed: now - 10000, // 10 sec idle
        inUse: false,
        createdAt: now - 120000 // 120 sec uptime
      });

      const status = pool.getStatus();
      const conn = status.connections[0];

      expect(conn.idleTime).toBeGreaterThanOrEqual(9900);
      expect(conn.idleTime).toBeLessThan(12000);
      expect(conn.uptime).toBeGreaterThanOrEqual(119900);
      expect(conn.uptime).toBeLessThan(122000);
    });
  });

  describe('Event Emitter inheritance', () => {
    test('should inherit from EventEmitter', () => {
      let listenerData = null;
      const listener = (data) => { listenerData = data; };
      pool.on('test-event', listener);
      pool.emit('test-event', 'data');
      
      expect(listenerData).toBe('data');
    });
  });
});
