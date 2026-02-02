/**
 * @fileoverview AutoHeal Agent - Automatically resolves common infrastructure issues
 * @module agents/autoheal
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { loadAutoHealPlaybooks } from '../lib/config-loader.js';
import { saveIncident } from '../lib/file-utils.js';
import { createLogger } from '../lib/logger.js';
import { updateIncidentWithAutoHealResult } from '../src/jsm/jsm-integration.js';

const execAsync = promisify(exec);
const logger = createLogger('autoheal');

/**
 * Allowed scenario names (allowlist approach)
 */
const ALLOWED_SCENARIOS = ['disk_space_low', 'process_down', 'memory_leak', 'api_slow', 'ssl_expiring'];

/**
 * Allowed context variable names (for sanitization)
 */
const ALLOWED_CONTEXT_KEYS = [
  'disk_usage',
  'memory_usage',
  'process_name',
  'process_status',
  'api_latency_ms',
  'ssl_expires_in_days'
];

/**
 * Validates scenario name against allowlist
 * @param {string} scenario - Scenario name to validate
 * @returns {boolean} Whether scenario is valid
 */
function validateScenario(scenario) {
  if (typeof scenario !== 'string') {
    logger.error('Validation failed: scenario must be a string', { scenario });
    return false;
  }

  if (scenario.length === 0 || scenario.length > 50) {
    logger.error('Validation failed: scenario length invalid', { scenario });
    return false;
  }

  // Allowlist check
  if (!ALLOWED_SCENARIOS.includes(scenario)) {
    logger.error('Validation failed: scenario not in allowlist', { scenario });
    return false;
  }

  // Additional pattern check (alphanumeric and underscore only)
  if (!/^[a-z0-9_]+$/.test(scenario)) {
    logger.error('Validation failed: scenario contains invalid characters', { scenario });
    return false;
  }

  return true;
}

/**
 * Validates and sanitizes context object
 * @param {Object} context - Context data to validate
 * @returns {Object} Sanitized context or throws error
 */
function validateContext(context) {
  if (typeof context !== 'object' || context === null) {
    throw new Error('Context must be a non-null object');
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(context)) {
    // Validate key is in allowlist
    if (!ALLOWED_CONTEXT_KEYS.includes(key)) {
      logger.warn('Validation: ignoring unknown context key', { key });
      continue;
    }

    // Validate and sanitize based on expected type
    if (key === 'process_name') {
      // String: alphanumeric, dash, underscore, dot only
      if (typeof value !== 'string') {
        throw new Error(`Context key '${key}' must be a string`);
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
        throw new Error(`Context key '${key}' contains invalid characters`);
      }
      if (value.length > 100) {
        throw new Error(`Context key '${key}' exceeds maximum length`);
      }
      sanitized[key] = value;
    } else if (key === 'process_status') {
      // Enum: only specific values allowed
      const allowedStatuses = ['running', 'stopped', 'crashed'];
      if (!allowedStatuses.includes(value)) {
        throw new Error(`Context key '${key}' has invalid value: ${value}`);
      }
      sanitized[key] = value;
    } else {
      // Numeric: validate as number
      const numValue = Number(value);
      if (!Number.isFinite(numValue)) {
        throw new Error(`Context key '${key}' must be a finite number`);
      }
      if (numValue < 0 || numValue > 1000000) {
        throw new Error(`Context key '${key}' value out of range`);
      }
      sanitized[key] = numValue;
    }
  }

  return sanitized;
}

/**
 * Sanitizes a command string by validating variable substitutions
 * @param {string} command - Command template
 * @param {Object} context - Context for variable substitution
 * @returns {string} Sanitized command
 */
function sanitizeCommand(command, context) {
  if (typeof command !== 'string') {
    throw new Error('Command must be a string');
  }

  if (command.length > 500) {
    throw new Error('Command exceeds maximum length');
  }

  // Detect dangerous patterns (shell injection attempts)
  const dangerousPatterns = [
    /[;&|`$()]/g, // Shell metacharacters
    /\$\{/g, // Variable expansion
    /\$\(/g, // Command substitution
    />>/g, // Redirection
    /<</g, // Here-doc
    /\|\|/g, // Logical OR
    /&&/g // Logical AND (except in playbook commands)
  ];

  // Check for dangerous patterns outside of allowed playbook commands
  let processedCommand = command;
  for (const [key, value] of Object.entries(context)) {
    processedCommand = processedCommand.replace(`{${key}}`, String(value));
  }

  // Allow && only in predefined playbook commands
  const allowedCommandPatterns = [
    /^find .+ -delete$/,
    /^docker system prune -f$/,
    /^pkill -f '.+' && systemctl start .+$/,
    /^certbot renew --quiet$/,
    /^nginx -s reload$/
  ];

  const isAllowedCommand = allowedCommandPatterns.some((pattern) => pattern.test(processedCommand));

  if (!isAllowedCommand) {
    // Stricter validation for non-whitelisted commands
    for (const pattern of dangerousPatterns) {
      if (pattern.test(processedCommand)) {
        throw new Error(`Command contains dangerous pattern: ${pattern.source}`);
      }
    }
  }

  return processedCommand;
}

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
  try {
    // Validate and sanitize context first
    const sanitizedContext = validateContext(context);

    // Sanitize command with validated context
    const processedCommand = sanitizeCommand(command, sanitizedContext);

    logger.info('Executing healing action', { command: processedCommand });

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
      command: command,
      error: error.message
    });

    return {
      success: false,
      command: command,
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
 * @param {Object} options - Healing options
 * @param {string} options.jsmIssueKey - JSM issue key to update with results
 * @returns {Promise<Object>} Healing result
 */
export async function heal(scenario, context = {}, options = {}) {
  const { jsmIssueKey } = options;
  const incidentId = `heal-${Date.now()}`;

  logger.info('Starting AutoHeal', { incidentId, scenario, context });

  // Validate scenario input
  if (!validateScenario(scenario)) {
    logger.error('Invalid scenario name', { scenario });
    return {
      incidentId,
      scenario,
      success: false,
      reason: `Invalid scenario name - must be one of: ${ALLOWED_SCENARIOS.join(', ')}`,
      duration: 0
    };
  }

  // Validate context input
  try {
    context = validateContext(context);
  } catch (error) {
    logger.error('Invalid context data', { error: error.message, context });
    return {
      incidentId,
      scenario,
      success: false,
      reason: `Invalid context data: ${error.message}`,
      duration: 0
    };
  }

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

  const report = generateIncidentReport(healingResult, context);
  const reportPath = saveIncident(incidentId, report);

  logger.info('AutoHeal completed', {
    incidentId,
    success: allSucceeded,
    duration,
    reportPath
  });

  const finalResult = { ...healingResult, reportPath };

  if (jsmIssueKey) {
    try {
      const jsmUpdateResult = await updateIncidentWithAutoHealResult(jsmIssueKey, finalResult);
      if (jsmUpdateResult) {
        logger.info('JSM ticket updated with AutoHeal result', {
          issueKey: jsmIssueKey,
          updated: jsmUpdateResult.updated
        });
        finalResult.jsmUpdated = true;
      }
    } catch (error) {
      logger.warn('Failed to update JSM ticket with AutoHeal result', {
        issueKey: jsmIssueKey,
        error: error.message
      });
    }
  }

  return finalResult;
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
  // Validate CLI argument (external input)
  const rawScenario = process.argv[2] || 'disk_space_low';

  if (!validateScenario(rawScenario)) {
    logger.error('Invalid scenario from CLI', { scenario: rawScenario });
    console.error(`Error: Invalid scenario '${rawScenario}'`);
    console.error(`Allowed scenarios: ${ALLOWED_SCENARIOS.join(', ')}`);
    process.exit(1);
  }

  const scenario = rawScenario;
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
