/**
 * @fileoverview Reporter Agent - Generates periodic operational reports
 * @module agents/reporter
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '../lib/logger.js';
import { saveReport, getRecentMetrics } from '../lib/file-utils.js';

const logger = createLogger('reporter');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = join(__dirname, '../..');

/**
 * Calculates statistics from metrics array
 * @param {Array<number>} values - Array of numeric values
 * @returns {Object} Statistics (min, max, avg, median)
 */
function calculateStats(values) {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / values.length,
    median: sorted[Math.floor(sorted.length / 2)]
  };
}

/**
 * Analyzes metrics trends over time
 * @param {Array} metricsArray - Array of metrics objects
 * @returns {Object} Trend analysis
 */
function analyzeMetricsTrends(metricsArray) {
  const cpuValues = [];
  const memoryValues = [];
  const diskValues = [];

  metricsArray.forEach(m => {
    if (m.system?.cpu) cpuValues.push(m.system.cpu);
    if (m.system?.memory?.percentage) memoryValues.push(m.system.memory.percentage);
    if (m.system?.disk?.[0]?.percentage) diskValues.push(m.system.disk[0].percentage);
  });

  return {
    cpu: calculateStats(cpuValues),
    memory: calculateStats(memoryValues),
    disk: calculateStats(diskValues),
    dataPoints: metricsArray.length
  };
}

/**
 * Reads and summarizes incidents from incident files
 * @param {number} hours - Look back N hours
 * @returns {Array} Array of incident summaries
 */
function getRecentIncidents(hours = 24) {
  const incidentsDir = join(baseDir, 'incidents');
  if (!existsSync(incidentsDir)) return [];

  const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
  const incidents = [];

  try {
    const files = readdirSync(incidentsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    for (const file of files) {
      const filepath = join(incidentsDir, file);
      const content = readFileSync(filepath, 'utf8');
      
      // Extract incident info from markdown
      const titleMatch = content.match(/# Incident Report: (.+)/);
      const statusMatch = content.match(/\*\*Status:\*\* (.+)/);
      const scenarioMatch = content.match(/\*\*Scenario:\*\* (.+)/);
      
      incidents.push({
        id: titleMatch?.[1] || 'unknown',
        filename: file,
        scenario: scenarioMatch?.[1] || 'unknown',
        status: statusMatch?.[1] || 'unknown',
        timestamp: file.split('-').slice(0, 3).join('-')
      });
    }
  } catch (error) {
    logger.error('Failed to read incidents', { error: error.message });
  }

  return incidents;
}

/**
 * Reads log analysis files
 * @param {number} hours - Look back N hours
 * @returns {Array} Array of analysis summaries
 */
function getRecentAnalyses(hours = 24) {
  const analysisDir = join(baseDir, 'analysis');
  if (!existsSync(analysisDir)) return [];

  try {
    const files = readdirSync(analysisDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 5); // Last 5 analyses

    return files.map(file => {
      const filepath = join(analysisDir, file);
      const content = readFileSync(filepath, 'utf8');
      
      const totalMatch = content.match(/\*\*Total Issues Found:\*\* (\d+)/);
      const criticalMatch = content.match(/Critical: (\d+)/);
      
      return {
        filename: file,
        totalIssues: parseInt(totalMatch?.[1] || '0'),
        criticalIssues: parseInt(criticalMatch?.[1] || '0')
      };
    });
  } catch (error) {
    logger.error('Failed to read analyses', { error: error.message });
    return [];
  }
}

/**
 * Generates a daily operational report
 * @returns {Promise<Object>} Report generation result
 */
export async function generateDailyReport() {
  logger.info('Generating daily report');

  const metrics = getRecentMetrics(24); // Last 24 hours
  const incidents = getRecentIncidents(24);
  const analyses = getRecentAnalyses(24);
  const trends = analyzeMetricsTrends(metrics);

  let report = `# Daily Operations Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Period:** Last 24 hours\n\n`;

  // Executive Summary
  report += `## Executive Summary\n\n`;
  report += `- **Metrics Collected:** ${metrics.length} data points\n`;
  report += `- **Incidents:** ${incidents.length}\n`;
  report += `- **Log Analyses:** ${analyses.length}\n\n`;

  // System Health
  report += `## System Health\n\n`;
  report += `### CPU Usage\n`;
  report += `- **Average:** ${trends.cpu.avg.toFixed(2)}%\n`;
  report += `- **Peak:** ${trends.cpu.max.toFixed(2)}%\n`;
  report += `- **Status:** ${trends.cpu.max > 90 ? '⚠️ High' : '✅ Normal'}\n\n`;

  report += `### Memory Usage\n`;
  report += `- **Average:** ${trends.memory.avg.toFixed(2)}%\n`;
  report += `- **Peak:** ${trends.memory.max.toFixed(2)}%\n`;
  report += `- **Status:** ${trends.memory.max > 90 ? '⚠️ High' : '✅ Normal'}\n\n`;

  report += `### Disk Usage\n`;
  report += `- **Average:** ${trends.disk.avg.toFixed(2)}%\n`;
  report += `- **Peak:** ${trends.disk.max.toFixed(2)}%\n`;
  report += `- **Status:** ${trends.disk.max > 85 ? '⚠️ High' : '✅ Normal'}\n\n`;

  // Incidents
  if (incidents.length > 0) {
    report += `## Incidents (${incidents.length})\n\n`;
    incidents.forEach((incident, idx) => {
      report += `${idx + 1}. **${incident.id}**\n`;
      report += `   - Scenario: ${incident.scenario}\n`;
      report += `   - Status: ${incident.status}\n`;
      report += `   - Time: ${incident.timestamp}\n\n`;
    });
  } else {
    report += `## Incidents\n\n✅ No incidents in the last 24 hours.\n\n`;
  }

  // Log Analysis Summary
  if (analyses.length > 0) {
    report += `## Log Analysis Summary\n\n`;
    const totalIssues = analyses.reduce((sum, a) => sum + a.totalIssues, 0);
    const totalCritical = analyses.reduce((sum, a) => sum + a.criticalIssues, 0);
    
    report += `- **Total Issues Detected:** ${totalIssues}\n`;
    report += `- **Critical Issues:** ${totalCritical}\n\n`;
  }

  // Recommendations
  report += `## Recommendations\n\n`;
  
  if (trends.cpu.max > 90) {
    report += `- 🔴 **CPU**: Peak usage exceeded 90%. Consider scaling or optimization.\n`;
  }
  
  if (trends.memory.max > 90) {
    report += `- 🔴 **Memory**: High memory usage detected. Monitor for leaks.\n`;
  }
  
  if (trends.disk.max > 85) {
    report += `- 🟡 **Disk**: Disk usage approaching threshold. Schedule cleanup.\n`;
  }
  
  if (incidents.length > 5) {
    report += `- ⚠️ **Incidents**: High incident count (${incidents.length}). Investigate root causes.\n`;
  }
  
  if (trends.cpu.max < 70 && trends.memory.max < 70 && incidents.length === 0) {
    report += `- ✅ **All Systems Nominal**: No action required.\n`;
  }

  const reportPath = saveReport('daily', report);
  
  logger.info('Daily report generated', { reportPath, incidents: incidents.length });

  return {
    type: 'daily',
    reportPath,
    metrics: {
      dataPoints: metrics.length,
      incidents: incidents.length,
      analyses: analyses.length
    },
    trends
  };
}

/**
 * Generates a weekly operational report
 * @returns {Promise<Object>} Report generation result
 */
export async function generateWeeklyReport() {
  logger.info('Generating weekly report');

  const metrics = getRecentMetrics(24 * 7); // Last 7 days
  const incidents = getRecentIncidents(24 * 7);
  const trends = analyzeMetricsTrends(metrics);

  let report = `# Weekly Operations Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Period:** Last 7 days\n\n`;

  report += `## Summary\n\n`;
  report += `- **Uptime Metrics:** ${metrics.length} collections\n`;
  report += `- **Total Incidents:** ${incidents.length}\n`;
  report += `- **Resolved Incidents:** ${incidents.filter(i => i.status.includes('Resolved')).length}\n\n`;

  report += `## Performance Trends\n\n`;
  report += `### CPU\n`;
  report += `- Min: ${trends.cpu.min.toFixed(2)}% | Max: ${trends.cpu.max.toFixed(2)}% | Avg: ${trends.cpu.avg.toFixed(2)}%\n\n`;
  
  report += `### Memory\n`;
  report += `- Min: ${trends.memory.min.toFixed(2)}% | Max: ${trends.memory.max.toFixed(2)}% | Avg: ${trends.memory.avg.toFixed(2)}%\n\n`;
  
  report += `### Disk\n`;
  report += `- Min: ${trends.disk.min.toFixed(2)}% | Max: ${trends.disk.max.toFixed(2)}% | Avg: ${trends.disk.avg.toFixed(2)}%\n\n`;

  report += `## Top Incidents\n\n`;
  incidents.slice(0, 10).forEach((incident, idx) => {
    report += `${idx + 1}. ${incident.scenario} - ${incident.status} (${incident.timestamp})\n`;
  });

  const reportPath = saveReport('weekly', report);
  
  logger.info('Weekly report generated', { reportPath });

  return {
    type: 'weekly',
    reportPath,
    metrics: {
      dataPoints: metrics.length,
      incidents: incidents.length
    },
    trends
  };
}

/**
 * Main function - generates report based on type
 * @param {string} type - Report type (daily, weekly)
 * @returns {Promise<Object>} Report generation result
 */
export async function generateReport(type = 'daily') {
  switch (type) {
    case 'daily':
      return generateDailyReport();
    case 'weekly':
      return generateWeeklyReport();
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

/**
 * Run reporter if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const reportType = process.argv[2] || 'daily';

  generateReport(reportType)
    .then(result => {
      logger.info('Report generation completed', result);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Report generation failed', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}

export default generateReport;
