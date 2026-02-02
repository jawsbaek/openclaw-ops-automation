/**
 * SSH Connection Pool Tests
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

// Mock ssh2
const mockClient = {
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn()
};

jest.unstable_mockModule('ssh2', () => ({
  Client: jest.fn(() => mockClient)
}));

const { default: SSHConnectionPool } = await import('../../../src/ssh/connection-pool.js');

describe('SSHConnectionPool', () => {
  let pool;

  beforeEach(() => {
    jest.useFakeTimers();
    pool = new SSHConnectionPool({
      maxConnections: 10,
      idleTimeout: 60000,
      connectTimeout: 5000
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (pool) {
      pool.closeAll();
    }
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      const defaultPool = new SSHConnectionPool();
      expect(defaultPool.maxConnections).toBe(50);
      expect(defaultPool.idleTimeout).toBe(300000);
      expect(defaultPool.connections.size).toBe(0);
      defaultPool.closeAll();
    });

    test('should initialize with custom options', () => {
      expect(pool.maxConnections).toBe(10);
      expect(pool.idleTimeout).toBe(60000);
      expect(pool.connectTimeout).toBe(5000);
    });

    test('should initialize stats', () => {
      expect(pool.stats).toEqual({
        totalConnections: 0,
        activeConnections: 0,
        failedConnections: 0
      });
    });
  });

  describe('getConnectionKey()', () => {
    test('should normalize host to lowercase', () => {
      expect(pool.getConnectionKey('SERVER1.example.com')).toBe('server1.example.com');
      expect(pool.getConnectionKey('Server2')).toBe('server2');
    });
  });

  describe('releaseConnection()', () => {
    test('should mark connection as not in use', () => {
      const conn = {
        client: mockClient,
        host: 'server1',
        inUse: true,
        lastUsed: Date.now() - 1000
      };
      pool.connections.set('server1', conn);

      pool.releaseConnection('server1');

      expect(conn.inUse).toBe(false);
      expect(conn.lastUsed).toBeGreaterThan(Date.now() - 100);
    });

    test('should handle non-existent connection gracefully', () => {
      expect(() => pool.releaseConnection('nonexistent')).not.toThrow();
    });
  });

  describe('closeConnection()', () => {
    test('should close and remove specific connection', () => {
      const mockEnd = jest.fn();
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

    test('should handle closing non-existent connection', () => {
      expect(() => pool.closeConnection('nonexistent')).not.toThrow();
    });
  });

  describe('closeAll()', () => {
    test('should close all connections', () => {
      const mockEnd1 = jest.fn();
      const mockEnd2 = jest.fn();

      pool.connections.set('server1', { client: { end: mockEnd1 } });
      pool.connections.set('server2', { client: { end: mockEnd2 } });
      pool.stats.activeConnections = 2;

      pool.closeAll();

      expect(mockEnd1).toHaveBeenCalled();
      expect(mockEnd2).toHaveBeenCalled();
      expect(pool.connections.size).toBe(0);
      expect(pool.stats.activeConnections).toBe(0);
    });
  });

  describe('cleanup()', () => {
    test('should remove idle connections', () => {
      const now = Date.now();
      const mockEnd1 = jest.fn();
      const mockEnd2 = jest.fn();

      // Old idle connection
      pool.connections.set('server1', {
        client: { end: mockEnd1 },
        inUse: false,
        lastUsed: now - 100000 // Older than idleTimeout
      });

      // Recent connection
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
    });

    test('should not remove connections in use', () => {
      const mockEnd = jest.fn();
      const now = Date.now();

      pool.connections.set('server1', {
        client: { end: mockEnd },
        inUse: true, // In use
        lastUsed: now - 100000
      });

      pool.cleanup();

      expect(mockEnd).not.toHaveBeenCalled();
      expect(pool.connections.has('server1')).toBe(true);
    });
  });

  describe('getStatus()', () => {
    test('should return pool status', () => {
      const now = Date.now();
      const mockEnd = jest.fn();
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

    test('should return empty status for new pool', () => {
      const status = pool.getStatus();

      expect(status.poolSize).toBe(0);
      expect(status.connections).toHaveLength(0);
      expect(status.stats.totalConnections).toBe(0);
    });
  });
});
