/**
 * @fileoverview AutoHeal Agent - Automatically resolves common infrastructure issues
 * @module agents/autoheal
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadAutoHealPlaybooks } from '../lib/config-loader.js';
import { saveIncident } from '../lib/file-utils.js';
import { createLogger } from '../lib/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('autoheal');

/**
 * Evaluates a condition string (simple implementation)
 * @param {string} condition - Condition string to evaluate
 * @param {Object} context - Context variables
 * @returns {boolean} Whether condition is met
 */
function evaluateCondition(condition, context) {
  // Simple condition evaluation
  // In production, use a proper expression evaluator

  // Example: "disk_usage > 90"
  const match = condition.match(/(\w+)\s*([><=]+)\s*(\d+)/);
  if (!match) return false;

  const [, variable, operator, value] = match;
  const contextValue = context[variable];
  const threshold = parseFloat(value);

  if (contextValue === undefined) return false;

  switch (operator) {
    case '>':
      return contextValue > threshold;
    case '<':
      return contextValue < threshold;
    case '>=':
      return contextValue >= threshold;
    case '<=':
      return contextValue <= threshold;
    case '==':
      return contextValue === threshold;
    default:
      return false;
  }
}

/**
 * Executes a healing action command
 * @param {string} command - Shell command to execute
 * @param {Object} context - Variable substitution context
 * @returns {Promise<Object>} Execution result
 */
async function executeAction(command, context = {}) {
  // Substitute variables in command
  let processedCommand = command;
  for (const [key, value] of Object.entries(context)) {
    processedCommand = processedCommand.replace(`{${key}}`, value);
  }

  logger.info('Executing healing action', { command: processedCommand });

  try {
    const { stdout, stderr } = await execAsync(processedCommand, {
      timeout: 30000, // 30 second timeout
      shell: '/bin/bash'
    });

    return {
      success: true,
      command: processedCommand,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    logger.error('Action execution failed', {
      command: processedCommand,
      error: error.message
    });

    return {
      success: false,
      command: processedCommand,
      error: error.message,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || ''
    };
  }
}

/**
 * Finds applicable playbook for given scenario
 * @param {string} scenario - Scenario name
 * @param {Object} context - Context data
 * @returns {Object|null} Matching playbook or null
 */
function findPlaybook(scenario, context) {
  const playbooks = loadAutoHealPlaybooks();

  // Direct scenario match
  if (playbooks[scenario]) {
    const playbook = playbooks[scenario];

    // Check condition if present
    if (playbook.condition) {
      if (!evaluateCondition(playbook.condition, context)) {
        logger.info('Playbook condition not met', { scenario, condition: playbook.condition });
        return null;
      }
    }

    return { name: scenario, ...playbook };
  }

  // Try to find by condition matching
  for (const [name, playbook] of Object.entries(playbooks)) {
    if (playbook.condition && evaluateCondition(playbook.condition, context)) {
      return { name, ...playbook };
    }
  }

  return null;
}

/**
 * Executes a healing playbook
 * @param {string} scenario - Scenario name or type
 * @param {Object} context - Context data (metrics, alert info, etc.)
 * @returns {Promise<Object>} Healing result
 */
export async function heal(scenario, context = {}) {
  const incidentId = `heal-${Date.now()}`;

  logger.info('Starting AutoHeal', { incidentId, scenario, context });

  const startTime = Date.now();
  const playbook = findPlaybook(scenario, context);

  if (!playbook) {
    logger.warn('No playbook found for scenario', { scenario });
    return {
      incidentId,
      scenario,
      success: false,
      reason: 'No applicable playbook found',
      duration: Date.now() - startTime
    };
  }

  logger.info('Executing playbook', { playbook: playbook.name, actions: playbook.actions.length });

  const actionResults = [];
  let allSucceeded = true;

  // Execute each action in sequence
  for (const action of playbook.actions) {
    const result = await executeAction(action, context);
    actionResults.push(result);

    if (!result.success) {
      allSucceeded = false;
      logger.error('Healing action failed, stopping playbook', {
        action,
        error: result.error
      });
      break;
    }
  }

  const duration = Date.now() - startTime;
  const healingResult = {
    incidentId,
    scenario,
    playbook: playbook.name,
    success: allSucceeded,
    actions: actionResults,
    duration,
    timestamp: new Date().toISOString()
  };

  // Generate incident report
  const report = generateIncidentReport(healingResult, context);
  const reportPath = saveIncident(incidentId, report);

  logger.info('AutoHeal completed', {
    incidentId,
    success: allSucceeded,
    duration,
    reportPath
  });

  return { ...healingResult, reportPath };
}

/**
 * Generates markdown incident report
 * @param {Object} result - Healing result
 * @param {Object} context - Original context
 * @returns {string} Markdown report
 */
function generateIncidentReport(result, context) {
  let report = `# Incident Report: ${result.incidentId}\n\n`;
  report += `**Timestamp:** ${result.timestamp}\n`;
  report += `**Scenario:** ${result.scenario}\n`;
  report += `**Playbook:** ${result.playbook}\n`;
  report += `**Status:** ${result.success ? '✅ Resolved' : '❌ Failed'}\n`;
  report += `**Duration:** ${result.duration}ms\n\n`;

  report += `## Context\n\n`;
  report += `\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\n`;

  report += `## Actions Taken\n\n`;
  result.actions.forEach((action, idx) => {
    report += `### ${idx + 1}. ${action.success ? '✅' : '❌'} ${action.command}\n\n`;

    if (action.stdout) {
      report += `**Output:**\n\`\`\`\n${action.stdout}\n\`\`\`\n\n`;
    }

    if (action.stderr) {
      report += `**Stderr:**\n\`\`\`\n${action.stderr}\n\`\`\`\n\n`;
    }

    if (action.error) {
      report += `**Error:**\n\`\`\`\n${action.error}\n\`\`\`\n\n`;
    }
  });

  report += `## Outcome\n\n`;
  if (result.success) {
    report += `The incident was successfully resolved automatically.\n`;
  } else {
    report += `⚠️ AutoHeal was unable to fully resolve the incident. Manual intervention may be required.\n`;
  }

  return report;
}

/**
 * Run AutoHeal if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const scenario = process.argv[2] || 'disk_space_low';
  const context = { disk_usage: 95 }; // Example context

  heal(scenario, context)
    .then((result) => {
      logger.info('AutoHeal run completed', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      logger.error('AutoHeal failed', { error: error.message, stack: error.stack });
      process.exit(1);
    });
}

export default heal;
