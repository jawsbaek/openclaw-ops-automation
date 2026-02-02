/**
 * @fileoverview JSM Integration Layer - Connects alerts and incidents to Jira Service Management
 * @module src/jsm/jsm-integration
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../lib/logger.js';
import { JSMClient } from './jsm-client.js';

const logger = createLogger('jsm-integration');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let config = null;
let client = null;
const incidentCache = new Map();

export function loadJSMConfig() {
  if (config) return config;

  const configPath = join(__dirname, '../../config/jsm-config.json');

  try {
    const content = readFileSync(configPath, 'utf8');
    config = JSON.parse(content);
    logger.info('JSM config loaded', { enabled: config.enabled });
    return config;
  } catch (error) {
    logger.error('Failed to load JSM config', { error: error.message });
    return { enabled: false };
  }
}

export function getJSMClient() {
  if (client) return client;

  const cfg = loadJSMConfig();
  if (!cfg.enabled) {
    logger.warn('JSM integration is disabled');
    return null;
  }

  client = new JSMClient(cfg);
  return client;
}

export function resetJSMClient() {
  client = null;
  config = null;
}

function generateDeduplicationKey(alert) {
  return `${alert.metric}-${alert.level}`;
}

async function findExistingIncident(alert, cfg) {
  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  const deduplicationKey = generateDeduplicationKey(alert);

  if (incidentCache.has(deduplicationKey)) {
    const cached = incidentCache.get(deduplicationKey);
    const ageMinutes = (Date.now() - cached.timestamp) / 60000;

    if (ageMinutes < cfg.deduplication.windowMinutes) {
      logger.info('Found cached incident', { issueKey: cached.issueKey });
      return cached.issueKey;
    }

    incidentCache.delete(deduplicationKey);
  }

  try {
    const alertIdField = cfg.customFields.alertId;
    const jql = `"${alertIdField}" ~ "${deduplicationKey}" AND status != Closed ORDER BY created DESC`;
    const result = await jsmClient.searchIssues(jql);

    if (result.issues && result.issues.length > 0) {
      const issueKey = result.issues[0].key;
      incidentCache.set(deduplicationKey, {
        issueKey,
        timestamp: Date.now()
      });
      return issueKey;
    }
  } catch (error) {
    logger.warn('Failed to search for existing incident', { error: error.message });
  }

  return null;
}

export async function createIncidentFromAlert(alert) {
  const cfg = loadJSMConfig();
  if (!cfg.enabled) {
    logger.debug('JSM disabled, skipping incident creation');
    return null;
  }

  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  if (cfg.deduplication?.enabled) {
    const existingIssue = await findExistingIncident(alert, cfg);
    if (existingIssue) {
      logger.info('Deduplicating alert to existing incident', {
        alertId: alert.id,
        issueKey: existingIssue
      });

      await addAlertOccurrence(existingIssue, alert);
      return { issueKey: existingIssue, deduplicated: true };
    }
  }

  const priority = cfg.priorityMapping[alert.level] || 'Medium';
  const issueType = cfg.issueTypeMapping[alert.level] || 'Incident';

  const description = buildIncidentDescription(alert);
  const customFields = buildCustomFields(alert, cfg);

  try {
    const result = await jsmClient.createRequest({
      requestTypeId: cfg.requestTypeId,
      summary: `[${alert.level.toUpperCase()}] ${alert.metric}: ${alert.message}`,
      description,
      priority,
      issueType,
      customFields
    });

    const deduplicationKey = generateDeduplicationKey(alert);
    incidentCache.set(deduplicationKey, {
      issueKey: result.issueKey,
      timestamp: Date.now()
    });

    logger.info('Incident created in JSM', {
      alertId: alert.id,
      issueKey: result.issueKey
    });

    return {
      issueKey: result.issueKey,
      issueId: result.issueId,
      deduplicated: false
    };
  } catch (error) {
    logger.error('Failed to create incident in JSM', {
      alertId: alert.id,
      error: error.message
    });
    return null;
  }
}

function buildIncidentDescription(alert) {
  let description = `h2. Alert Details\n\n`;
  description += `||Property||Value||\n`;
  description += `|Alert ID|${alert.id}|\n`;
  description += `|Metric|${alert.metric}|\n`;
  description += `|Value|${alert.value}|\n`;
  description += `|Threshold|${alert.threshold || 'N/A'}|\n`;
  description += `|Level|${alert.level}|\n`;
  description += `|Timestamp|${alert.timestamp}|\n\n`;

  description += `h2. Message\n\n`;
  description += `{quote}${alert.message}{quote}\n\n`;

  if (alert.metadata) {
    description += `h2. Metadata\n\n`;
    description += `{code:json}\n${JSON.stringify(alert.metadata, null, 2)}\n{code}\n\n`;
  }

  if (alert.shouldAutoHeal) {
    description += `h2. AutoHeal\n\n`;
    description += `This alert is eligible for automatic remediation. AutoHeal will attempt to resolve this issue.\n`;
  }

  return description;
}

function buildCustomFields(alert, cfg) {
  const fields = {};

  if (cfg.customFields.alertId) {
    fields[cfg.customFields.alertId] = generateDeduplicationKey(alert);
  }

  if (cfg.customFields.affectedSystem && alert.metric) {
    fields[cfg.customFields.affectedSystem] = alert.metric;
  }

  if (cfg.customFields.metricValue && alert.value !== undefined) {
    fields[cfg.customFields.metricValue] = String(alert.value);
  }

  if (cfg.customFields.autoHealAttempted) {
    fields[cfg.customFields.autoHealAttempted] = 'Pending';
  }

  return fields;
}

async function addAlertOccurrence(issueKey, alert) {
  const jsmClient = getJSMClient();
  if (!jsmClient) return;

  const comment =
    `h4. Additional Alert Occurrence\n\n` +
    `*Timestamp:* ${alert.timestamp}\n` +
    `*Value:* ${alert.value}\n` +
    `*Message:* ${alert.message}\n`;

  try {
    await jsmClient.addComment(issueKey, comment, false);
    logger.info('Added alert occurrence to incident', { issueKey });
  } catch (error) {
    logger.warn('Failed to add alert occurrence', { issueKey, error: error.message });
  }
}

export async function updateIncidentWithAutoHealResult(issueKey, healResult) {
  const cfg = loadJSMConfig();
  if (!cfg.enabled) return null;

  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  const comment = buildAutoHealComment(healResult);
  const labels = healResult.success
    ? [cfg.labels.autoHealSuccess]
    : [cfg.labels.autoHealFailed, cfg.labels.manualIntervention];

  try {
    await jsmClient.addComment(issueKey, comment, true);

    const updateFields = {};
    if (cfg.customFields.autoHealAttempted) {
      updateFields[cfg.customFields.autoHealAttempted] = 'Yes';
    }
    if (cfg.customFields.autoHealResult) {
      updateFields[cfg.customFields.autoHealResult] = healResult.success ? 'Success' : 'Failed';
    }

    if (Object.keys(updateFields).length > 0) {
      await jsmClient.updateIssue(issueKey, updateFields);
    }

    await jsmClient.addLabels(issueKey, labels);

    if (healResult.success && cfg.transitionMapping.resolved) {
      await jsmClient.transitionIssue(
        issueKey,
        cfg.transitionMapping.resolved,
        'Issue automatically resolved by AutoHeal'
      );
    }

    logger.info('Updated incident with AutoHeal result', {
      issueKey,
      success: healResult.success
    });

    return { issueKey, updated: true };
  } catch (error) {
    logger.error('Failed to update incident with AutoHeal result', {
      issueKey,
      error: error.message
    });
    return null;
  }
}

function buildAutoHealComment(healResult) {
  let comment = `h3. AutoHeal ${healResult.success ? 'Succeeded' : 'Failed'}\n\n`;
  comment += `*Incident ID:* ${healResult.incidentId}\n`;
  comment += `*Playbook:* ${healResult.playbook}\n`;
  comment += `*Duration:* ${healResult.duration}ms\n`;
  comment += `*Timestamp:* ${healResult.timestamp}\n\n`;

  if (healResult.actions && healResult.actions.length > 0) {
    comment += `h4. Actions Executed\n\n`;
    comment += `||#||Command||Status||\n`;

    healResult.actions.forEach((action, idx) => {
      const status = action.success ? '(/)' : '(x)';
      const cmd = action.command.substring(0, 50) + (action.command.length > 50 ? '...' : '');
      comment += `|${idx + 1}|{noformat}${cmd}{noformat}|${status}|\n`;
    });

    comment += `\n`;
  }

  if (!healResult.success) {
    comment += `{panel:title=Manual Intervention Required|borderStyle=solid|borderColor=#FF0000}\n`;
    comment += `AutoHeal was unable to resolve this issue automatically. `;
    comment += `Please investigate and resolve manually.\n`;
    comment += `{panel}\n`;
  }

  if (healResult.reportPath) {
    comment += `\n_Full incident report available at: ${healResult.reportPath}_\n`;
  }

  return comment;
}

export async function closeIncident(issueKey, resolution = 'Resolved') {
  const cfg = loadJSMConfig();
  if (!cfg.enabled) return null;

  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  try {
    if (cfg.transitionMapping.closed) {
      await jsmClient.transitionIssue(issueKey, cfg.transitionMapping.closed, `Incident closed: ${resolution}`);
    }

    logger.info('Incident closed in JSM', { issueKey, resolution });
    return { issueKey, closed: true };
  } catch (error) {
    logger.error('Failed to close incident', { issueKey, error: error.message });
    return null;
  }
}

export async function addIncidentComment(issueKey, comment, isPublic = true) {
  const cfg = loadJSMConfig();
  if (!cfg.enabled) return null;

  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  try {
    await jsmClient.addComment(issueKey, comment, isPublic);
    logger.info('Comment added to incident', { issueKey, isPublic });
    return { issueKey, commented: true };
  } catch (error) {
    logger.error('Failed to add comment', { issueKey, error: error.message });
    return null;
  }
}

export async function linkReportToIncident(issueKey, reportPath, reportType) {
  const cfg = loadJSMConfig();
  if (!cfg.enabled) return null;

  const jsmClient = getJSMClient();
  if (!jsmClient) return null;

  const comment =
    `h4. ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report Generated\n\n` +
    `A ${reportType} operations report has been generated.\n` +
    `*Report Path:* ${reportPath}\n`;

  try {
    await jsmClient.addComment(issueKey, comment, true);
    logger.info('Report linked to incident', { issueKey, reportType });
    return { issueKey, linked: true };
  } catch (error) {
    logger.error('Failed to link report', { issueKey, error: error.message });
    return null;
  }
}

export function clearIncidentCache() {
  incidentCache.clear();
  logger.debug('Incident cache cleared');
}

export default {
  loadJSMConfig,
  getJSMClient,
  resetJSMClient,
  createIncidentFromAlert,
  updateIncidentWithAutoHealResult,
  closeIncident,
  addIncidentComment,
  linkReportToIncident,
  clearIncidentCache
};
