/**
 * @fileoverview File utilities for saving metrics, reports, and analysis
 * @module lib/file-utils
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = join(__dirname, '../..');

/**
 * Ensures a directory exists, creates it if not
 * @param {string} dirPath - Directory path
 */
export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Saves metrics data to timestamped JSON file
 * @param {Object} metrics - Metrics data object
 * @returns {string} Path to saved file
 */
export function saveMetrics(metrics) {
  const metricsDir = join(baseDir, 'metrics');
  ensureDir(metricsDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `metrics-${timestamp}.json`;
  const filepath = join(metricsDir, filename);
  
  writeFileSync(filepath, JSON.stringify(metrics, null, 2), 'utf8');
  return filepath;
}

/**
 * Saves log analysis results
 * @param {string} content - Analysis content (markdown)
 * @returns {string} Path to saved file
 */
export function saveAnalysis(content) {
  const analysisDir = join(baseDir, 'analysis');
  ensureDir(analysisDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `log-insights-${timestamp}.md`;
  const filepath = join(analysisDir, filename);
  
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}

/**
 * Saves incident report
 * @param {string} incidentId - Unique incident identifier
 * @param {string} content - Incident report content (markdown)
 * @returns {string} Path to saved file
 */
export function saveIncident(incidentId, content) {
  const incidentsDir = join(baseDir, 'incidents');
  ensureDir(incidentsDir);
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-${incidentId}.md`;
  const filepath = join(incidentsDir, filename);
  
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}

/**
 * Saves ops report
 * @param {string} reportType - Type of report (daily, weekly, monthly)
 * @param {string} content - Report content (markdown)
 * @returns {string} Path to saved file
 */
export function saveReport(reportType, content) {
  const reportsDir = join(baseDir, 'reports');
  ensureDir(reportsDir);
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `ops-report-${reportType}-${date}.md`;
  const filepath = join(reportsDir, filename);
  
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}

/**
 * Reads the most recent metrics file
 * @returns {Object|null} Latest metrics data or null if none found
 */
export function getLatestMetrics() {
  const metricsDir = join(baseDir, 'metrics');
  if (!existsSync(metricsDir)) return null;
  
  const files = readdirSync(metricsDir)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const latestFile = join(metricsDir, files[0]);
  const data = readFileSync(latestFile, 'utf8');
  return JSON.parse(data);
}

/**
 * Gets metrics files from the last N hours
 * @param {number} hours - Number of hours to look back
 * @returns {Array<Object>} Array of metrics objects
 */
export function getRecentMetrics(hours = 24) {
  const metricsDir = join(baseDir, 'metrics');
  if (!existsSync(metricsDir)) return [];
  
  const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
  const files = readdirSync(metricsDir)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  const recentMetrics = [];
  for (const file of files) {
    const filepath = join(metricsDir, file);
    const data = readFileSync(filepath, 'utf8');
    const metrics = JSON.parse(data);
    
    if (new Date(metrics.timestamp).getTime() < cutoffTime) break;
    recentMetrics.push(metrics);
  }
  
  return recentMetrics;
}

export default {
  ensureDir,
  saveMetrics,
  saveAnalysis,
  saveIncident,
  saveReport,
  getLatestMetrics,
  getRecentMetrics
};
