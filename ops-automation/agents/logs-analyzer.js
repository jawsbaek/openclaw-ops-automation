/**
 * @fileoverview Logs Analyzer Agent - Analyzes log files for patterns and anomalies
 * @module agents/logs-analyzer
 */

import { existsSync, readFileSync } from 'node:fs';
import { loadMonitoringSources } from '../lib/config-loader.js';
import { saveAnalysis } from '../lib/file-utils.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('logs-analyzer');

/**
 * Error pattern definitions
 */
const ERROR_PATTERNS = [
  { pattern: /ERROR|Error|error/g, severity: 'error', category: 'general' },
  { pattern: /FATAL|Fatal|fatal|CRITICAL|Critical/g, severity: 'critical', category: 'critical' },
  { pattern: /WARN|Warning|warning/g, severity: 'warning', category: 'warning' },
  { pattern: /Exception|exception/g, severity: 'error', category: 'exception' },
  { pattern: /timeout|Timeout|TIMEOUT/g, severity: 'warning', category: 'timeout' },
  { pattern: /fail|Fail|FAIL|failed|Failed/g, severity: 'error', category: 'failure' },
  { pattern: /unauthorized|Unauthorized|forbidden|Forbidden|403|401/g, severity: 'warning', category: 'security' },
  { pattern: /500|502|503|504/g, severity: 'error', category: 'http_error' },
  { pattern: /connection refused|Connection refused/g, severity: 'error', category: 'connection' },
  { pattern: /out of memory|OutOfMemory|OOM/g, severity: 'critical', category: 'resource' }
];

/**
 * Reads log file content
 * @param {string} logPath - Path to log file
 * @param {number} tailLines - Number of lines to read from end (0 = all)
 * @returns {string} Log file content
 */
function readLogFile(logPath, tailLines = 1000) {
  if (!existsSync(logPath)) {
    logger.warn(`Log file not found: ${logPath}`);
    return '';
  }

  try {
    const content = readFileSync(logPath, 'utf8');

    if (tailLines === 0) {
      return content;
    }

    const lines = content.split('\n');
    return lines.slice(-tailLines).join('\n');
  } catch (error) {
    logger.error(`Failed to read log file: ${logPath}`, { error: error.message });
    return '';
  }
}

/**
 * Analyzes log content for error patterns
 * @param {string} content - Log content
 * @returns {Object} Analysis results
 */
function analyzePatterns(content) {
  const findings = {
    total: 0,
    bySeverity: { critical: 0, error: 0, warning: 0 },
    byCategory: {},
    samples: []
  };

  const lines = content.split('\n');

  for (const errorDef of ERROR_PATTERNS) {
    const matches = content.match(errorDef.pattern) || [];
    const count = matches.length;

    if (count > 0) {
      findings.total += count;
      findings.bySeverity[errorDef.severity] += count;
      findings.byCategory[errorDef.category] = (findings.byCategory[errorDef.category] || 0) + count;

      const sampleLines = lines.filter((line) => errorDef.pattern.test(line)).slice(0, 3);
      if (sampleLines.length > 0) {
        findings.samples.push({
          category: errorDef.category,
          severity: errorDef.severity,
          count,
          examples: sampleLines
        });
      }
    }
  }

  return findings;
}

/**
 * Detects anomalous patterns (e.g., repeated errors, sudden spikes)
 * @param {string} content - Log content
 * @returns {Array} Array of detected anomalies
 */
function detectAnomalies(content) {
  const anomalies = [];
  const lines = content.split('\n').filter((l) => l.trim());

  const errorCounts = {};
  lines.forEach((line) => {
    if (/error|ERROR|Error/i.test(line)) {
      const normalized = line.replace(/\d{4}-\d{2}-\d{2}.*?\s/, '').slice(0, 100);
      errorCounts[normalized] = (errorCounts[normalized] || 0) + 1;
    }
  });

  Object.entries(errorCounts).forEach(([msg, count]) => {
    if (count > 10) {
      anomalies.push({
        type: 'repeated_error',
        count,
        message: msg,
        severity: 'high'
      });
    }
  });

  const recentErrors = lines.filter((l) => /error|ERROR|Error/i.test(l)).slice(-50);
  if (recentErrors.length > 30) {
    anomalies.push({
      type: 'error_burst',
      count: recentErrors.length,
      message: 'High error rate detected in recent logs',
      severity: 'critical'
    });
  }

  return anomalies;
}

/**
 * Calculates overall severity breakdown from results
 * @param {Array} results - Analysis results
 * @returns {Object} Severity counts by type
 */
function calculateOverallSeverity(results) {
  const overallSeverity = { critical: 0, error: 0, warning: 0 };
  results.forEach((r) => {
    overallSeverity.critical += r.findings.bySeverity.critical;
    overallSeverity.error += r.findings.bySeverity.error;
    overallSeverity.warning += r.findings.bySeverity.warning;
  });
  return overallSeverity;
}

/**
 * Generates summary section of report
 * @param {Array} results - Analysis results
 * @param {Object} overallSeverity - Severity breakdown
 * @returns {string} Summary section markdown
 */
function generateSummarySection(results, overallSeverity) {
  const totalFindings = results.reduce((sum, r) => sum + r.findings.total, 0);
  
  let section = `## Summary\n\n`;
  section += `- **Total Issues Found:** ${totalFindings}\n`;
  section += `- **Log Files Analyzed:** ${results.length}\n\n`;
  section += `### Severity Breakdown\n\n`;
  section += `- 🔴 Critical: ${overallSeverity.critical}\n`;
  section += `- 🟠 Error: ${overallSeverity.error}\n`;
  section += `- 🟡 Warning: ${overallSeverity.warning}\n\n`;
  
  return section;
}

/**
 * Generates anomalies section of report
 * @param {Array} allAnomalies - All detected anomalies
 * @returns {string} Anomalies section markdown
 */
function generateAnomaliesSection(allAnomalies) {
  if (allAnomalies.length === 0) return '';
  
  let section = `## ⚠️ Anomalies Detected\n\n`;
  allAnomalies.forEach((anomaly, idx) => {
    section += `### ${idx + 1}. ${anomaly.type} (${anomaly.severity})\n\n`;
    section += `- **Count:** ${anomaly.count}\n`;
    section += `- **Message:** ${anomaly.message}\n\n`;
  });
  
  return section;
}

/**
 * Generates detailed findings section for a single result
 * @param {Object} result - Single analysis result
 * @returns {string} Detailed finding markdown
 */
function generateDetailedFinding(result) {
  let section = `### ${result.logFile}\n\n`;

  if (result.findings.total === 0) {
    return section + `✅ No issues found.\n\n`;
  }

  section += `**Total Issues:** ${result.findings.total}\n\n`;

  const categories = Object.entries(result.findings.byCategory);
  if (categories.length > 0) {
    section += `**By Category:**\n\n`;
    categories.forEach(([cat, count]) => {
      section += `- ${cat}: ${count}\n`;
    });
    section += `\n`;
  }

  if (result.findings.samples.length > 0) {
    section += `**Sample Errors:**\n\n`;
    result.findings.samples.slice(0, 5).forEach((sample) => {
      section += `**${sample.category}** (${sample.severity}, count: ${sample.count}):\n`;
      section += `\`\`\`\n${sample.examples[0]}\n\`\`\`\n\n`;
    });
  }

  return section;
}

/**
 * Generates recommendations section
 * @param {Object} overallSeverity - Severity breakdown
 * @param {Array} allAnomalies - All detected anomalies
 * @returns {string} Recommendations section markdown
 */
function generateRecommendationsSection(overallSeverity, allAnomalies) {
  let section = `## Recommendations\n\n`;

  if (overallSeverity.critical > 0) {
    section += `- 🔴 **URGENT**: ${overallSeverity.critical} critical issues require immediate attention\n`;
  }

  if (allAnomalies.some((a) => a.type === 'error_burst')) {
    section += `- ⚠️ Error burst detected - investigate for system issues\n`;
  }

  if (allAnomalies.some((a) => a.type === 'repeated_error')) {
    section += `- 🔁 Repeated errors detected - may indicate persistent bug or configuration issue\n`;
  }

  return section;
}

/**
 * Generates markdown report from analysis results
 * @param {Object} results - Analysis results
 * @returns {string} Markdown formatted report
 */
function generateReport(results) {
  const timestamp = new Date().toISOString();
  const overallSeverity = calculateOverallSeverity(results);
  const allAnomalies = results.flatMap((r) => r.anomalies);

  let report = `# Log Analysis Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += generateSummarySection(results, overallSeverity);
  report += generateAnomaliesSection(allAnomalies);
  report += `## Detailed Findings\n\n`;
  
  results.forEach((result) => {
    report += generateDetailedFinding(result);
  });

  report += generateRecommendationsSection(overallSeverity, allAnomalies);

  return report;
}

/**
 * Main analysis function
 * @returns {Promise<Object>} Analysis results and report path
 */
export async function analyzeLogs() {
  logger.info('Starting log analysis');

  const config = loadMonitoringSources();
  const logPaths = config.logs?.paths || [];

  if (logPaths.length === 0) {
    logger.warn('No log paths configured');
    return { results: [], reportPath: null };
  }

  const results = [];

  for (const logPath of logPaths) {
    logger.info(`Analyzing log: ${logPath}`);

    const content = readLogFile(logPath, 1000);
    if (!content) continue;

    const findings = analyzePatterns(content);
    const anomalies = detectAnomalies(content);

    results.push({
      logFile: logPath,
      findings,
      anomalies,
      analyzedAt: new Date().toISOString()
    });

    logger.info(`Analysis complete for ${logPath}`, {
      totalIssues: findings.total,
      anomalies: anomalies.length
    });
  }

  const report = generateReport(results);
  const reportPath = saveAnalysis(report);

  logger.info('Log analysis completed', {
    filesAnalyzed: results.length,
    reportPath
  });

  return { results, reportPath };
}

/**
 * Run log analysis if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeLogs()
    .then(() => {
      logger.info('Log analysis completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Log analysis failed', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}

export default analyzeLogs;
