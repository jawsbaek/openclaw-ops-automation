/**
 * @fileoverview Orchestrator Agent - Main coordinator for all operations agents
 * @module agents/orchestrator
 */

import { createLogger } from '../lib/logger.js';
import { run as runAlertHandler } from './alert-handler.js';
import analyzeLogs from './logs-analyzer.js';
import collectMetrics from './metrics-collector.js';
import generateReport from './reporter.js';

const logger = createLogger('orchestrator');

/**
 * Agent task scheduler state
 */
const schedulerState = {
  lastMetricsCollection: 0,
  lastLogAnalysis: 0,
  lastAlertCheck: 0,
  lastDailyReport: 0,
  runCount: 0
};

/**
 * Configuration for agent scheduling
 */
const SCHEDULE_CONFIG = {
  metricsInterval: 5 * 60 * 1000, // 5 minutes
  logsInterval: 10 * 60 * 1000, // 10 minutes
  alertInterval: 2 * 60 * 1000, // 2 minutes
  dailyReportHour: 9, // 9 AM
  weeklyReportDay: 1, // Monday
  weeklyReportHour: 10 // 10 AM
};

/**
 * Checks if it's time to run a specific task
 * @param {string} taskName - Name of the task
 * @param {number} interval - Interval in milliseconds
 * @returns {boolean} Whether it's time to run
 */
function isTimeToRun(taskName, interval) {
  const now = Date.now();
  const lastRun = schedulerState[`last${taskName}`] || 0;
  return now - lastRun >= interval;
}

/**
 * Updates last run timestamp for a task
 * @param {string} taskName - Name of the task
 */
function markTaskRun(taskName) {
  schedulerState[`last${taskName}`] = Date.now();
}

/**
 * Checks if daily report should be generated
 * @returns {boolean} Whether to generate daily report
 */
function shouldGenerateDailyReport() {
  const now = new Date();
  const currentHour = now.getHours();
  const lastReportDate = new Date(schedulerState.lastDailyReport);

  // Check if it's the right hour and hasn't been run today
  if (currentHour === SCHEDULE_CONFIG.dailyReportHour) {
    if (now.toDateString() !== lastReportDate.toDateString()) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if weekly report should be generated
 * @returns {boolean} Whether to generate weekly report
 */
function shouldGenerateWeeklyReport() {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.getHours();
  const lastReportDate = new Date(schedulerState.lastDailyReport);

  if (currentDay === SCHEDULE_CONFIG.weeklyReportDay && currentHour === SCHEDULE_CONFIG.weeklyReportHour) {
    // Check if not already run this week
    const daysSinceLastReport = (now - lastReportDate) / (1000 * 60 * 60 * 24);
    if (daysSinceLastReport >= 6) {
      return true;
    }
  }

  return false;
}

/**
 * Runs metrics collection task
 * @returns {Promise<Object>} Task result
 */
async function runMetricsCollection() {
  logger.info('Running metrics collection');

  try {
    const metrics = await collectMetrics();
    markTaskRun('MetricsCollection');

    return {
      task: 'metrics-collection',
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        cpu: metrics.system?.cpu,
        memory: metrics.system?.memory?.percentage,
        healthchecks: metrics.healthchecks?.length
      }
    };
  } catch (error) {
    logger.error('Metrics collection failed', { error: error.message });
    return {
      task: 'metrics-collection',
      success: false,
      error: error.message
    };
  }
}

/**
 * Runs log analysis task
 * @returns {Promise<Object>} Task result
 */
async function runLogAnalysis() {
  logger.info('Running log analysis');

  try {
    const result = await analyzeLogs();
    markTaskRun('LogAnalysis');

    const totalIssues = result.results.reduce((sum, r) => sum + r.findings.total, 0);
    const totalAnomalies = result.results.reduce((sum, r) => sum + r.anomalies.length, 0);

    return {
      task: 'log-analysis',
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        filesAnalyzed: result.results.length,
        totalIssues,
        totalAnomalies,
        reportPath: result.reportPath
      }
    };
  } catch (error) {
    logger.error('Log analysis failed', { error: error.message });
    return {
      task: 'log-analysis',
      success: false,
      error: error.message
    };
  }
}

/**
 * Runs alert checking and handling
 * @returns {Promise<Object>} Task result
 */
async function runAlertChecking() {
  logger.info('Running alert checking');

  try {
    const result = await runAlertHandler();
    markTaskRun('AlertCheck');

    return {
      task: 'alert-check',
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        alertsProcessed: result.alertsProcessed,
        actionsTriggered: result.results.length
      }
    };
  } catch (error) {
    logger.error('Alert checking failed', { error: error.message });
    return {
      task: 'alert-check',
      success: false,
      error: error.message
    };
  }
}

/**
 * Generates scheduled reports
 * @returns {Promise<Object>} Task result
 */
async function runReportGeneration() {
  logger.info('Checking for scheduled reports');

  const results = [];

  if (shouldGenerateDailyReport()) {
    logger.info('Generating daily report');
    try {
      const result = await generateReport('daily');
      markTaskRun('DailyReport');
      results.push({
        type: 'daily',
        success: true,
        reportPath: result.reportPath
      });
    } catch (error) {
      logger.error('Daily report generation failed', { error: error.message });
      results.push({
        type: 'daily',
        success: false,
        error: error.message
      });
    }
  }

  if (shouldGenerateWeeklyReport()) {
    logger.info('Generating weekly report');
    try {
      const result = await generateReport('weekly');
      results.push({
        type: 'weekly',
        success: true,
        reportPath: result.reportPath
      });
    } catch (error) {
      logger.error('Weekly report generation failed', { error: error.message });
      results.push({
        type: 'weekly',
        success: false,
        error: error.message
      });
    }
  }

  return {
    task: 'report-generation',
    success: true,
    reports: results
  };
}

/**
 * Main orchestrator heartbeat - decides what to run
 * @returns {Promise<Object>} Orchestration result
 */
export async function heartbeat() {
  schedulerState.runCount++;

  logger.info('Orchestrator heartbeat', {
    runCount: schedulerState.runCount,
    uptime: process.uptime()
  });

  const tasks = [];

  // Schedule metrics collection
  if (isTimeToRun('MetricsCollection', SCHEDULE_CONFIG.metricsInterval)) {
    tasks.push(runMetricsCollection());
  }

  // Schedule log analysis
  if (isTimeToRun('LogAnalysis', SCHEDULE_CONFIG.logsInterval)) {
    tasks.push(runLogAnalysis());
  }

  // Schedule alert checking
  if (isTimeToRun('AlertCheck', SCHEDULE_CONFIG.alertInterval)) {
    tasks.push(runAlertChecking());
  }

  // Check for scheduled reports
  tasks.push(runReportGeneration());

  // Execute all scheduled tasks in parallel
  const results = await Promise.allSettled(tasks);

  const summary = {
    timestamp: new Date().toISOString(),
    runCount: schedulerState.runCount,
    tasksExecuted: results.length,
    successful: results.filter((r) => r.status === 'fulfilled' && r.value.success).length,
    failed: results.filter((r) => r.status === 'rejected' || !r.value?.success).length,
    results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason }))
  };

  logger.info('Heartbeat completed', summary);

  return summary;
}

/**
 * Starts the orchestrator in continuous mode
 * @param {number} interval - Heartbeat interval in milliseconds
 */
export async function start(interval = 60000) {
  logger.info('Orchestrator starting', { interval });

  // Run initial heartbeat
  await heartbeat();

  // Schedule recurring heartbeats
  setInterval(async () => {
    try {
      await heartbeat();
    } catch (error) {
      logger.error('Heartbeat error', { error: error.message, stack: error.stack });
    }
  }, interval);

  logger.info('Orchestrator started, heartbeat scheduled');
}

/**
 * Run orchestrator if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'once';

  if (mode === 'continuous') {
    start(60000) // 1 minute heartbeat
      .catch((error) => {
        logger.error('Orchestrator failed to start', { error: error.message });
        process.exit(1);
      });
  } else {
    // Run once
    heartbeat()
      .then((result) => {
        logger.info('Orchestrator run completed', result);
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Orchestrator run failed', { error: error.message, stack: error.stack });
        process.exit(1);
      });
  }
}

export default { heartbeat, start };
