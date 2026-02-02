/**
 * @fileoverview Tests for logger utility
 */

import { createLogger } from '../../lib/logger.js';

describe('Logger', () => {
  test('createLogger returns a Winston logger instance', () => {
    const logger = createLogger('test-agent');

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  test('logger has correct agent name in metadata', () => {
    const logger = createLogger('metrics-collector');

    // Winston logger should have defaultMeta with agent name
    expect(logger.defaultMeta).toBeDefined();
    expect(logger.defaultMeta.agent).toBe('metrics-collector');
  });

  test('logger supports different log levels', () => {
    const logger = createLogger('test');

    // Should not throw
    expect(() => {
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.debug('debug message');
    }).not.toThrow();
  });
});
