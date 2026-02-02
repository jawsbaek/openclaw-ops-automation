/**
 * @fileoverview Centralized logging utility for all agents
 * @module lib/logger
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, '../../logs');

// Ensure logs directory exists
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

/**
 * Creates a logger instance for an agent
 * @param {string} agentName - Name of the agent
 * @returns {winston.Logger} Configured Winston logger
 */
export function createLogger(agentName) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { agent: agentName },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, agent, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${agent}] ${level}: ${message} ${metaStr}`;
          })
        )
      }),
      new winston.transports.File({
        filename: join(logsDir, `${agentName}.log`),
        maxsize: 5242880,
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: join(logsDir, `${agentName}-error.log`),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5
      })
    ]
  });
}

export default createLogger;
