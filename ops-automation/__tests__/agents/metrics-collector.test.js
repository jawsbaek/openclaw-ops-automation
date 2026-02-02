/**
 * @fileoverview Tests for Metrics Collector Agent
 */

import { collectMetrics } from '../../agents/metrics-collector.js';

describe('Metrics Collector', () => {
  test('collectMetrics returns a valid metrics object', async () => {
    const metrics = await collectMetrics();
    
    expect(metrics).toBeDefined();
    expect(metrics).toHaveProperty('timestamp');
    expect(metrics).toHaveProperty('system');
    expect(metrics).toHaveProperty('collector');
  }, 10000); // 10 second timeout for actual system calls

  test('metrics object has system data', async () => {
    const metrics = await collectMetrics();
    
    expect(metrics.system).toHaveProperty('cpu');
    expect(metrics.system).toHaveProperty('memory');
    expect(metrics.system).toHaveProperty('disk');
    
    expect(typeof metrics.system.cpu).toBe('number');
    expect(typeof metrics.system.memory).toBe('object');
  }, 10000);

  test('timestamp is valid ISO string', async () => {
    const metrics = await collectMetrics();
    
    const timestamp = new Date(metrics.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
    expect(metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 10000);

  test('collector metadata is present', async () => {
    const metrics = await collectMetrics();
    
    expect(metrics.collector).toHaveProperty('version');
    expect(typeof metrics.collector.version).toBe('string');
  }, 10000);
});
