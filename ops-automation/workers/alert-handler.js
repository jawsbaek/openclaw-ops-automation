/**
 * @fileoverview Alert Handler Agent - Processes and prioritizes system alerts
 * @module agents/alert-handler
 */

import { loadAlertThresholds } from '../lib/config-loader.js';
import { getLatestMetrics } from '../lib/file-utils.js';
import { createLogger } from '../lib/logger.js';
import { createIncidentFromAlert } from '../src/jsm/jsm-integration.js';

const logger = createLogger('alert-handler');

/**
 * Alert priority levels
 */
const PRIORITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * Alert deduplication cache (simple in-memory cache)
 * In production, this should be persistent (Redis, etc.)
 */
const alertCache = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Evaluates metric against threshold
 * @param {number} value - Current metric value
 * @param {Object} threshold - Threshold configuration
 * @returns {Object|null} Alert object or null if no alert
 */
function evaluateThreshold(metricName, value, threshold) {
  if (value >= threshold.critical) {
    return {
      metric: metricName,
      value,
      threshold: threshold.critical,
      level: PRIORITY.CRITICAL,
      message: `${metricName} is critical: ${value} >= ${threshold.critical}`
    };
  }

  if (value >= threshold.warning) {
    return {
      metric: metricName,
      value,
      threshold: threshold.warning,
      level: PRIORITY.HIGH,
      message: `${metricName} is high: ${value} >= ${threshold.warning}`
    };
  }

  return null;
}

/**
 * Checks if alert is duplicate (within deduplication window)
 * @param {Object} alert - Alert object
 * @returns {boolean} True if duplicate, false otherwise
 */
function isDuplicate(alert) {
  const key = `${alert.metric}-${alert.level}`;
  const now = Date.now();

  if (alertCache.has(key)) {
    const lastAlertTime = alertCache.get(key);
    if (now - lastAlertTime < DEDUP_WINDOW_MS) {
      return true;
    }
  }

  alertCache.set(key, now);
  return false;
}

/**
 * Cleans up old entries from alert cache
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, timestamp] of alertCache.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      alertCache.delete(key);
    }
  }
}

/**
 * Determines if AutoHeal should be triggered
 * @param {Object} alert - Alert object
 * @returns {boolean} True if AutoHeal should run
 */
function shouldTriggerAutoHeal(alert) {
  // AutoHeal triggers for critical and high priority alerts
  if (alert.level === PRIORITY.CRITICAL || alert.level === PRIORITY.HIGH) {
    // Check if metric is autoHeal-eligible
    const autoHealMetrics = ['disk_usage', 'memory_usage', 'process_down'];
    return autoHealMetrics.some((m) => alert.metric.includes(m));
  }
  return false;
}

/**
 * Processes current metrics and generates alerts
 * @returns {Promise<Array>} Array of alert objects
 */
export async function processAlerts() {
  logger.info('Processing alerts');

  const thresholds = loadAlertThresholds();
  const metrics = getLatestMetrics();

  if (!metrics) {
    logger.warn('No metrics available for alert processing');
    return [];
  }

  const alerts = [];

  // Check CPU
  if (metrics.system?.cpu !== undefined) {
    const alert = evaluateThreshold('cpu_usage', metrics.system.cpu, thresholds.cpu_usage);
    if (alert) alerts.push(alert);
  }

  // Check Memory
  if (metrics.system?.memory?.percentage !== undefined) {
    const alert = evaluateThreshold('memory_usage', metrics.system.memory.percentage, thresholds.memory_usage);
    if (alert) alerts.push(alert);
  }

  // Check Disk
  if (metrics.system?.disk) {
    for (const disk of metrics.system.disk) {
      const alert = evaluateThreshold(`disk_usage_${disk.mount}`, disk.percentage, thresholds.disk_usage);
      if (alert) {
        alert.metadata = { device: disk.device, mount: disk.mount };
        alerts.push(alert);
      }
    }
  }

  // Check Healthchecks
  if (metrics.healthchecks) {
    for (const check of metrics.healthchecks) {
      if (check.status === 'unhealthy') {
        alerts.push({
          metric: 'healthcheck_failed',
          value: check.name,
          level: PRIORITY.CRITICAL,
          message: `Healthcheck failed: ${check.name} at ${check.url}`,
          metadata: check
        });
      } else if (check.latency > thresholds.api_latency_ms?.critical) {
        alerts.push({
          metric: 'api_latency',
          value: check.latency,
          threshold: thresholds.api_latency_ms.critical,
          level: PRIORITY.HIGH,
          message: `High latency detected: ${check.name} took ${check.latency}ms`,
          metadata: check
        });
      }
    }
  }

  // Filter duplicates
  const uniqueAlerts = alerts.filter((alert) => !isDuplicate(alert));

  // Clean up old cache entries
  cleanupCache();

  // Add timestamps and IDs
  const processedAlerts = uniqueAlerts.map((alert, idx) => ({
    id: `alert-${Date.now()}-${idx}`,
    timestamp: new Date().toISOString(),
    ...alert,
    shouldAutoHeal: shouldTriggerAutoHeal(alert)
  }));

  logger.info('Alert processing complete', {
    totalAlerts: alerts.length,
    uniqueAlerts: uniqueAlerts.length,
    criticalAlerts: processedAlerts.filter((a) => a.level === PRIORITY.CRITICAL).length,
    autoHealTriggers: processedAlerts.filter((a) => a.shouldAutoHeal).length
  });

  return processedAlerts;
}

/**
 * Creates a JSM incident from an alert
 * @param {Object} alert - Alert object
 * @returns {Promise<Object|null>} JSM incident result or null if disabled/failed
 */
async function createJSMIncident(alert) {
  try {
    const result = await createIncidentFromAlert(alert);
    if (result) {
      logger.info('JSM incident created', {
        alertId: alert.id,
        issueKey: result.issueKey,
        deduplicated: result.deduplicated
      });
      return result;
    }
    return null;
  } catch (error) {
    logger.warn('Failed to create JSM incident', {
      alertId: alert.id,
      error: error.message
    });
    return null;
  }
}

/**
 * Handles a single alert (escalation, notification, triggering AutoHeal)
 * @param {Object} alert - Alert object
 * @param {Object} options - Handler options
 * @param {boolean} options.createJSMTicket - Whether to create JSM ticket (default: true)
 * @returns {Promise<Object>} Handling result
 */
export async function handleAlert(alert, options = {}) {
  const { createJSMTicket = true } = options;

  logger.info('Handling alert', {
    id: alert.id,
    metric: alert.metric,
    level: alert.level
  });

  const result = {
    alertId: alert.id,
    actions: [],
    timestamp: new Date().toISOString()
  };

  // Log alert
  result.actions.push('logged');

  if (createJSMTicket) {
    const jsmResult = await createJSMIncident(alert);
    if (jsmResult) {
      result.actions.push('jsm_ticket_created');
      result.jsmIssueKey = jsmResult.issueKey;
      result.jsmDeduplicated = jsmResult.deduplicated;
    }
  }

  // If critical, we should notify (in real system, send email/slack/pagerduty)
  if (alert.level === PRIORITY.CRITICAL) {
    logger.warn('CRITICAL ALERT', {
      metric: alert.metric,
      value: alert.value,
      message: alert.message
    });
    result.actions.push('notified');
  }

  // Trigger AutoHeal if applicable
  if (alert.shouldAutoHeal) {
    logger.info('Triggering AutoHeal for alert', { alertId: alert.id });
    result.actions.push('autoheal_triggered');
    result.autoHealRequested = true;

    // In real implementation, this would spawn AutoHeal agent
    // openclaw agents spawn autoheal --task "Handle alert: ${alert.id}"
  }

  return result;
}

/**
 * Main alert processing workflow
 * @returns {Promise<Object>} Processing results
 */
export async function run() {
  logger.info('Alert handler starting');

  const alerts = await processAlerts();
  const results = [];

  for (const alert of alerts) {
    const result = await handleAlert(alert);
    results.push(result);
  }

  return {
    alertsProcessed: alerts.length,
    results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Run alert handler if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((result) => {
      logger.info('Alert handler completed', result);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Alert handler failed', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}

export default { processAlerts, handleAlert, run };
