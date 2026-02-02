/**
 * SSH Connection Pool
 * 다중 서버에 대한 SSH 연결을 관리하고 재사용
 */

import { Client } from 'ssh2';
import { EventEmitter } from 'events';
import createLogger from '../../lib/logger.js';

const logger = createLogger('ssh-pool');

class SSHConnectionPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConnections = options.maxConnections || 50;
    this.idleTimeout = options.idleTimeout || 300000; // 5분
    this.connectTimeout = options.connectTimeout || 10000;
    this.connections = new Map(); // host -> { client, lastUsed, inUse }
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0
    };
    
    // 주기적으로 유휴 연결 정리
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * 서버에 연결 가져오기 (있으면 재사용, 없으면 생성)
   */
  async getConnection(host, config) {
    const key = this.getConnectionKey(host);
    
    // 기존 연결 재사용
    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      if (conn.client && !conn.inUse) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        logger.debug(`SSH 연결 재사용: ${host}`);
        return conn.client;
      }
    }

    // 최대 연결 수 체크
    if (this.connections.size >= this.maxConnections) {
      throw new Error(`최대 SSH 연결 수 초과: ${this.maxConnections}`);
    }

    // 새 연결 생성
    return await this.createConnection(host, config);
  }

  /**
   * 새 SSH 연결 생성
   */
  async createConnection(host, config) {
    const key = this.getConnectionKey(host);
    
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error(`SSH 연결 타임아웃: ${host}`));
      }, this.connectTimeout);

      client.on('ready', () => {
        clearTimeout(timeout);
        
        this.connections.set(key, {
          client,
          host,
          lastUsed: Date.now(),
          inUse: true,
          createdAt: Date.now()
        });
        
        this.stats.totalConnections++;
        this.stats.activeConnections++;
        
        logger.info(`SSH 연결 성공: ${host}`);
        this.emit('connected', host);
        resolve(client);
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        this.stats.failedConnections++;
        logger.error(`SSH 연결 실패: ${host}`, err);
        this.emit('error', { host, error: err });
        reject(err);
      });

      client.on('close', () => {
        if (this.connections.has(key)) {
          this.connections.delete(key);
          this.stats.activeConnections--;
          logger.debug(`SSH 연결 종료: ${host}`);
          this.emit('closed', host);
        }
      });

      // 연결 시작
      client.connect({
        host: config.host || host,
        port: config.port || 22,
        username: config.username,
        privateKey: config.privateKey,
        readyTimeout: this.connectTimeout
      });
    });
  }

  /**
   * 연결 반환 (재사용을 위해)
   */
  releaseConnection(host) {
    const key = this.getConnectionKey(host);
    const conn = this.connections.get(key);
    
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
      logger.debug(`SSH 연결 반환: ${host}`);
    }
  }

  /**
   * 특정 연결 종료
   */
  closeConnection(host) {
    const key = this.getConnectionKey(host);
    const conn = this.connections.get(key);
    
    if (conn) {
      conn.client.end();
      this.connections.delete(key);
      this.stats.activeConnections--;
      logger.info(`SSH 연결 종료: ${host}`);
    }
  }

  /**
   * 모든 연결 종료
   */
  closeAll() {
    logger.info(`모든 SSH 연결 종료 중 (${this.connections.size}개)`);
    
    for (const [key, conn] of this.connections.entries()) {
      conn.client.end();
    }
    
    this.connections.clear();
    this.stats.activeConnections = 0;
    clearInterval(this.cleanupInterval);
  }

  /**
   * 유휴 연결 정리
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, conn] of this.connections.entries()) {
      const idleTime = now - conn.lastUsed;
      
      if (!conn.inUse && idleTime > this.idleTimeout) {
        conn.client.end();
        this.connections.delete(key);
        this.stats.activeConnections--;
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`유휴 SSH 연결 ${cleaned}개 정리`);
    }
  }

  /**
   * 연결 상태 조회
   */
  getStatus() {
    const connections = [];
    
    for (const [key, conn] of this.connections.entries()) {
      connections.push({
        host: conn.host,
        inUse: conn.inUse,
        idleTime: Date.now() - conn.lastUsed,
        uptime: Date.now() - conn.createdAt
      });
    }
    
    return {
      stats: this.stats,
      connections,
      poolSize: this.connections.size,
      maxConnections: this.maxConnections
    };
  }

  /**
   * 연결 키 생성
   */
  getConnectionKey(host) {
    return host.toLowerCase();
  }
}

export default SSHConnectionPool;
