# Security Enhancements
## OpenClaw Ops Automation - Prioritized Implementation Guide

**Document Version**: 1.0  
**Date**: February 2, 2026  
**Status**: Implementation Roadmap

---

## Overview

This document provides a prioritized, actionable list of security enhancements for the OpenClaw Ops Automation system. Each enhancement includes implementation details, code examples, and testing procedures.

---

## Priority Levels

| Priority | Risk Level | Timeline | Production Blocking |
|----------|-----------|----------|---------------------|
| 🔴 **Critical** | 9.0-10.0 | Immediate (1-2 weeks) | ✅ Yes |
| 🟠 **High** | 7.0-8.9 | Short-term (3-4 weeks) | ⚠️ Recommended |
| 🟡 **Medium** | 4.0-6.9 | Mid-term (5-6 weeks) | ❌ No |
| 🟢 **Low** | 1.0-3.9 | Long-term (7-8 weeks) | ❌ No |

---

## 🔴 CRITICAL Priority

### 1. Command Execution Whitelist & Validation

**Issue**: SEC-001, SEC-002, SEC-003  
**Risk Score**: 9.8  
**Effort**: 20 hours  
**Impact**: Prevents arbitrary command execution

#### Implementation

**File**: `ops-automation/lib/command-validator.js` (new file)

```javascript
/**
 * Command Validator - Prevents command injection attacks
 * Only whitelisted commands with validated parameters are allowed
 */

const path = require('path');
const fs = require('fs');

// Whitelist of allowed commands with their safe parameter patterns
const COMMAND_WHITELIST = {
  // Disk cleanup
  'cleanup_tmp': {
    command: 'find',
    args: ['/tmp', '-type', 'f', '-mtime', '+{days}', '-delete'],
    params: {
      days: /^\d+$/ // Only digits
    },
    description: 'Clean temporary files older than N days'
  },
  
  'cleanup_logs': {
    command: 'find',
    args: ['/var/log/openclaw', '-name', '*.log.*', '-mtime', '+{days}', '-delete'],
    params: {
      days: /^\d+$/
    },
    description: 'Clean old log files'
  },
  
  // Docker operations
  'docker_prune': {
    command: 'docker',
    args: ['system', 'prune', '-f'],
    params: {},
    description: 'Clean unused Docker resources'
  },
  
  'docker_prune_volumes': {
    command: 'docker',
    args: ['system', 'prune', '-f', '--volumes'],
    params: {},
    description: 'Clean unused Docker resources including volumes'
  },
  
  // Service management
  'restart_nginx': {
    command: 'brew',
    args: ['services', 'restart', 'nginx'],
    params: {},
    description: 'Restart nginx service'
  },
  
  'reload_nginx': {
    command: 'nginx',
    args: ['-s', 'reload'],
    params: {},
    description: 'Reload nginx configuration'
  },
  
  'restart_postgresql': {
    command: 'brew',
    args: ['services', 'restart', 'postgresql'],
    params: {},
    description: 'Restart PostgreSQL service'
  },
  
  // OpenClaw operations
  'openclaw_restart': {
    command: 'openclaw',
    args: ['gateway', 'restart'],
    params: {},
    description: 'Restart OpenClaw gateway'
  },
  
  // SSL certificate renewal
  'certbot_renew': {
    command: 'certbot',
    args: ['renew', '--quiet'],
    params: {},
    description: 'Renew SSL certificates'
  },
  
  // Homebrew cleanup
  'brew_cleanup': {
    command: 'brew',
    args: ['cleanup'],
    params: {},
    description: 'Clean Homebrew cache'
  }
};

// Allowed base directories for file operations
const ALLOWED_DIRECTORIES = [
  '/tmp',
  '/var/log/openclaw',
  '/Users/User/.openclaw'
];

class CommandValidator {
  /**
   * Validate and build a safe command
   * @param {string} commandId - ID from COMMAND_WHITELIST
   * @param {object} params - Parameters to substitute
   * @returns {object} { command, args, validated: true }
   * @throws {Error} If command is not whitelisted or params are invalid
   */
  validateCommand(commandId, params = {}) {
    const spec = COMMAND_WHITELIST[commandId];
    
    if (!spec) {
      throw new Error(`Command '${commandId}' is not whitelisted`);
    }
    
    // Validate all required parameters
    const validatedParams = {};
    for (const [key, pattern] of Object.entries(spec.params)) {
      const value = params[key];
      
      if (value === undefined) {
        throw new Error(`Missing required parameter: ${key}`);
      }
      
      if (!pattern.test(String(value))) {
        throw new Error(`Invalid parameter '${key}': ${value}`);
      }
      
      validatedParams[key] = String(value);
    }
    
    // Substitute parameters in args
    const args = spec.args.map(arg => {
      return arg.replace(/\{(\w+)\}/g, (match, paramName) => {
        if (!validatedParams[paramName]) {
          throw new Error(`Unknown parameter in template: ${paramName}`);
        }
        return validatedParams[paramName];
      });
    });
    
    return {
      command: spec.command,
      args,
      description: spec.description,
      validated: true
    };
  }
  
  /**
   * Validate a file path
   * @param {string} filePath - Path to validate
   * @returns {string} Canonicalized safe path
   * @throws {Error} If path is not in allowed directories
   */
  validatePath(filePath) {
    try {
      // Resolve to absolute path (follows symlinks)
      const resolved = path.resolve(filePath);
      
      // Check against allowed directories
      const isAllowed = ALLOWED_DIRECTORIES.some(allowedDir => {
        const allowedResolved = path.resolve(allowedDir);
        return resolved.startsWith(allowedResolved);
      });
      
      if (!isAllowed) {
        throw new Error(`Path '${filePath}' is not in allowed directories`);
      }
      
      // Check for directory traversal attempts
      if (filePath.includes('..') || filePath.includes('~')) {
        throw new Error(`Path '${filePath}' contains suspicious characters`);
      }
      
      return resolved;
    } catch (error) {
      throw new Error(`Invalid path: ${error.message}`);
    }
  }
  
  /**
   * Get list of available commands
   * @returns {array} List of command IDs and descriptions
   */
  listCommands() {
    return Object.entries(COMMAND_WHITELIST).map(([id, spec]) => ({
      id,
      description: spec.description,
      params: Object.keys(spec.params)
    }));
  }
}

module.exports = new CommandValidator();
```

**Usage in AutoHeal**:

```javascript
// ops-automation/lib/autoheal-executor.js
const commandValidator = require('./command-validator');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function executeAutoHealAction(action, incident) {
  try {
    // Validate command
    const validated = commandValidator.validateCommand(
      action.commandId,
      action.params
    );
    
    console.log(`Executing whitelisted command: ${validated.description}`);
    console.log(`Command: ${validated.command} ${validated.args.join(' ')}`);
    
    // Execute using array form (prevents shell injection)
    const { stdout, stderr } = await execAsync(
      `${validated.command} ${validated.args.map(arg => `'${arg}'`).join(' ')}`,
      {
        timeout: action.timeout_seconds * 1000,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      }
    );
    
    return {
      success: true,
      output: stdout,
      error: stderr,
      commandId: action.commandId
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      commandId: action.commandId
    };
  }
}
```

**Updated Playbook Format**:

```json
{
  "disk_space_low": {
    "condition": {
      "metric": "disk_usage",
      "operator": ">",
      "threshold": 90
    },
    "actions": [
      {
        "commandId": "cleanup_tmp",
        "params": { "days": "7" },
        "description": "Clean temporary files older than 7 days",
        "timeout_seconds": 60
      },
      {
        "commandId": "cleanup_logs",
        "params": { "days": "30" },
        "description": "Remove old log archives",
        "timeout_seconds": 60
      },
      {
        "commandId": "docker_prune",
        "params": {},
        "description": "Clean unused Docker resources",
        "timeout_seconds": 120
      }
    ],
    "verify": {
      "metric": "disk_usage",
      "operator": "<",
      "threshold": 85
    },
    "requires_approval": false
  }
}
```

#### Testing

```bash
# Test script: tests/test-command-validator.js
const commandValidator = require('../ops-automation/lib/command-validator');
const assert = require('assert');

// Test 1: Valid command
try {
  const cmd = commandValidator.validateCommand('cleanup_tmp', { days: '7' });
  assert.strictEqual(cmd.command, 'find');
  assert.deepStrictEqual(cmd.args, ['/tmp', '-type', 'f', '-mtime', '+7', '-delete']);
  console.log('✅ Test 1 passed: Valid command');
} catch (e) {
  console.error('❌ Test 1 failed:', e.message);
}

// Test 2: Invalid command ID
try {
  commandValidator.validateCommand('rm_rf_root', {});
  console.error('❌ Test 2 failed: Should have rejected invalid command');
} catch (e) {
  console.log('✅ Test 2 passed: Invalid command rejected');
}

// Test 3: Command injection attempt
try {
  commandValidator.validateCommand('cleanup_tmp', { days: '7; rm -rf /' });
  console.error('❌ Test 3 failed: Should have rejected injection');
} catch (e) {
  console.log('✅ Test 3 passed: Injection attempt blocked');
}

// Test 4: Path traversal
try {
  commandValidator.validatePath('/tmp/../../etc/passwd');
  console.error('❌ Test 4 failed: Should have rejected path traversal');
} catch (e) {
  console.log('✅ Test 4 passed: Path traversal blocked');
}
```

---

### 2. Webhook Authentication

**Issue**: SEC-004  
**Risk Score**: 9.1  
**Effort**: 16 hours  
**Impact**: Prevents unauthorized access and fake alerts

#### Implementation

**File**: `ops-automation/lib/webhook-auth.js` (new file)

```javascript
/**
 * Webhook Authentication Middleware
 * Supports both token-based and HMAC signature verification
 */

const crypto = require('crypto');

class WebhookAuthenticator {
  constructor() {
    // Load secrets from environment
    this.webhookToken = process.env.WEBHOOK_AUTH_TOKEN;
    this.webhookSecret = process.env.WEBHOOK_SECRET;
    
    if (!this.webhookToken && !this.webhookSecret) {
      console.warn('⚠️  No webhook authentication configured! Set WEBHOOK_AUTH_TOKEN or WEBHOOK_SECRET');
    }
  }
  
  /**
   * Express middleware for token-based authentication
   */
  verifyToken(req, res, next) {
    if (!this.webhookToken) {
      // Auth not configured - log warning and proceed (dev mode only)
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ 
          error: 'Webhook authentication not configured' 
        });
      }
      console.warn('⚠️  Webhook auth bypassed (dev mode)');
      return next();
    }
    
    const providedToken = req.headers['x-webhook-token'] || 
                         req.headers['authorization']?.replace('Bearer ', '');
    
    if (!providedToken) {
      this.logAuthFailure(req, 'missing_token');
      return res.status(401).json({ 
        error: 'Missing authentication token',
        hint: 'Provide X-Webhook-Token header or Authorization: Bearer <token>'
      });
    }
    
    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(this.webhookToken)
    )) {
      this.logAuthFailure(req, 'invalid_token');
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    // Success
    req.authenticated = true;
    req.authMethod = 'token';
    next();
  }
  
  /**
   * Express middleware for HMAC signature verification
   * Compatible with GitHub, GitLab, Alertmanager webhooks
   */
  verifySignature(req, res, next) {
    if (!this.webhookSecret) {
      // Signature auth not configured
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ 
          error: 'Webhook signature verification not configured' 
        });
      }
      console.warn('⚠️  Signature verification bypassed (dev mode)');
      return next();
    }
    
    const signature = req.headers['x-hub-signature-256'] || 
                     req.headers['x-webhook-signature'];
    
    if (!signature) {
      this.logAuthFailure(req, 'missing_signature');
      return res.status(401).json({ 
        error: 'Missing webhook signature',
        hint: 'Provide X-Hub-Signature-256 or X-Webhook-Signature header'
      });
    }
    
    // Compute expected signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    
    // Constant-time comparison
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      this.logAuthFailure(req, 'invalid_signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    // Success
    req.authenticated = true;
    req.authMethod = 'signature';
    next();
  }
  
  /**
   * Combined middleware - accepts either token or signature
   */
  verify(req, res, next) {
    const hasToken = req.headers['x-webhook-token'] || req.headers['authorization'];
    const hasSignature = req.headers['x-hub-signature-256'] || req.headers['x-webhook-signature'];
    
    if (hasToken) {
      return this.verifyToken(req, res, next);
    } else if (hasSignature) {
      return this.verifySignature(req, res, next);
    } else {
      this.logAuthFailure(req, 'no_credentials');
      return res.status(401).json({
        error: 'No authentication credentials provided',
        hint: 'Provide either X-Webhook-Token or X-Hub-Signature-256'
      });
    }
  }
  
  /**
   * Generate a new webhook token
   */
  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Generate a webhook secret for HMAC
   */
  static generateSecret() {
    return crypto.randomBytes(32).toString('base64');
  }
  
  /**
   * Log authentication failures for security monitoring
   */
  logAuthFailure(req, reason) {
    const event = {
      type: 'webhook_auth_failure',
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      reason,
      path: req.path,
      userAgent: req.headers['user-agent'],
      source: req.body?.source
    };
    
    // Log to security audit file
    const fs = require('fs');
    const logPath = 'logs/security-audit.jsonl';
    fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
    
    console.warn(`🚨 Webhook auth failure: ${reason} from ${event.ip}`);
  }
}

module.exports = new WebhookAuthenticator();
```

**Usage**:

```javascript
// ops-automation/webhook-server.js
const express = require('express');
const webhookAuth = require('./lib/webhook-auth');

const app = express();

// Parse JSON bodies
app.use(express.json({ limit: '100kb' }));

// Apply authentication to all webhook endpoints
app.post('/alerts/webhook', 
  webhookAuth.verify.bind(webhookAuth),
  async (req, res) => {
    try {
      // Process authenticated webhook
      await handleAlert(req.body);
      res.json({ status: 'ok', received: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.listen(18789, () => {
  console.log('Webhook server running on http://localhost:18789');
  console.log('Authentication:', process.env.WEBHOOK_AUTH_TOKEN ? '✅ Enabled' : '⚠️  Disabled');
});
```

**Configuration**:

```bash
# .env.example
# Generate tokens using:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Token-based authentication (simple, recommended for internal use)
WEBHOOK_AUTH_TOKEN=your-secret-token-here

# HMAC signature authentication (recommended for external integrations)
WEBHOOK_SECRET=your-webhook-secret-here

# Environment
NODE_ENV=production
```

**Client examples**:

```bash
# Token-based
curl -X POST http://localhost:18789/alerts/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Token: your-secret-token-here' \
  -d '{"source": "prometheus", "alerts": [...]}'

# Signature-based (Python)
import hmac
import hashlib
import json
import requests

payload = {"source": "prometheus", "alerts": [...]}
payload_json = json.dumps(payload)

signature = "sha256=" + hmac.new(
    b"your-webhook-secret-here",
    payload_json.encode(),
    hashlib.sha256
).hexdigest()

requests.post(
    "http://localhost:18789/alerts/webhook",
    json=payload,
    headers={"X-Hub-Signature-256": signature}
)
```

#### Testing

```bash
# tests/test-webhook-auth.js
const request = require('supertest');
const app = require('../ops-automation/webhook-server');

describe('Webhook Authentication', () => {
  it('should reject requests without authentication', async () => {
    const res = await request(app)
      .post('/alerts/webhook')
      .send({ alerts: [] });
    
    expect(res.status).toBe(401);
  });
  
  it('should accept requests with valid token', async () => {
    const res = await request(app)
      .post('/alerts/webhook')
      .set('X-Webhook-Token', process.env.WEBHOOK_AUTH_TOKEN)
      .send({ alerts: [] });
    
    expect(res.status).toBe(200);
  });
  
  it('should reject requests with invalid token', async () => {
    const res = await request(app)
      .post('/alerts/webhook')
      .set('X-Webhook-Token', 'wrong-token')
      .send({ alerts: [] });
    
    expect(res.status).toBe(401);
  });
});
```

---

### 3. Secrets Management

**Issue**: SEC-006  
**Risk Score**: 7.5  
**Effort**: 12 hours  
**Impact**: Prevents credential exposure

#### Implementation

**File**: `ops-automation/lib/config-loader.js` (new file)

```javascript
/**
 * Secure Configuration Loader
 * Supports environment variables, .env files, and secrets vaults
 */

const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.loadDotEnv();
  }
  
  /**
   * Load .env file if it exists
   */
  loadDotEnv() {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      console.warn('⚠️  No .env file found, using system environment variables');
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) continue;
      
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      
      // Only set if not already in environment
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  }
  
  /**
   * Load JSON config with environment variable substitution
   * @param {string} configPath - Path to config file
   * @returns {object} Parsed and substituted configuration
   */
  loadConfig(configPath) {
    let content = fs.readFileSync(configPath, 'utf8');
    
    // Replace ${VAR_NAME} with environment variables
    content = content.replace(/\$\{([A-Z_]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      
      if (value === undefined) {
        throw new Error(
          `Missing required environment variable: ${varName}\n` +
          `Referenced in: ${configPath}\n` +
          `Please set ${varName} in your environment or .env file`
        );
      }
      
      return value;
    });
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }
  }
  
  /**
   * Get a required environment variable
   * @param {string} name - Variable name
   * @param {string} defaultValue - Optional default
   * @returns {string} Variable value
   * @throws {Error} If variable is not set and no default provided
   */
  getEnv(name, defaultValue = undefined) {
    const value = process.env[name];
    
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Required environment variable not set: ${name}`);
    }
    
    return value;
  }
  
  /**
   * Validate that all required environment variables are set
   * @param {array} requiredVars - List of required variable names
   * @throws {Error} If any required variables are missing
   */
  validateEnv(requiredVars) {
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables:\n` +
        missing.map(v => `  - ${v}`).join('\n') +
        `\n\nPlease set these variables in your .env file or environment.`
      );
    }
  }
}

module.exports = new ConfigLoader();
```

**Updated Configuration Files**:

```json
// ops-automation/config/monitoring-sources.json
{
  "prometheus": {
    "enabled": true,
    "endpoint": "${PROMETHEUS_URL}",
    "username": "${PROMETHEUS_USER}",
    "password": "${PROMETHEUS_PASSWORD}",
    "queries": {
      "cpu": "rate(node_cpu_seconds_total{mode!=\"idle\"}[5m])"
    }
  },
  "system": {
    "enabled": true
  },
  "logs": {
    "enabled": true,
    "paths": [
      "/tmp/openclaw/*.log"
    ]
  }
}
```

```bash
# .env.example (commit this template to git)
# DO NOT commit the actual .env file!

# Prometheus Configuration
PROMETHEUS_URL=http://localhost:9090
PROMETHEUS_USER=monitoring
PROMETHEUS_PASSWORD=change-me-in-production

# Webhook Authentication
WEBHOOK_AUTH_TOKEN=generate-with-openssl-rand-hex-32
WEBHOOK_SECRET=generate-with-openssl-rand-base64-32

# Database (if needed)
# DATABASE_URL=postgresql://user:pass@localhost:5432/ops_automation

# OpenClaw
OPENCLAW_GATEWAY_URL=http://localhost:18789

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

```bash
# .gitignore (ensure .env is ignored)
.env
.env.local
.env.*.local
config/*.secret.json
*.key
*.pem
```

**Usage**:

```javascript
// ops-automation/agents/metrics-collector.md → actual implementation
const configLoader = require('./lib/config-loader');

// Validate required environment variables
configLoader.validateEnv([
  'PROMETHEUS_URL',
  'WEBHOOK_AUTH_TOKEN'
]);

// Load configuration with substitution
const monitoringConfig = configLoader.loadConfig(
  'config/monitoring-sources.json'
);

// Access configuration safely
const prometheusUrl = monitoringConfig.prometheus.endpoint;
const prometheusUser = monitoringConfig.prometheus.username;
// These will have actual values from environment variables
```

**Setup Script Update**:

```bash
# ops-automation/scripts/setup.sh (add to existing script)

# Generate secrets if .env doesn't exist
if [ ! -f .env ]; then
  echo "📝 Generating .env file with secure secrets..."
  
  # Copy template
  cp .env.example .env
  
  # Generate secrets
  WEBHOOK_TOKEN=$(openssl rand -hex 32)
  WEBHOOK_SECRET=$(openssl rand -base64 32)
  
  # Update .env file
  sed -i '' "s/generate-with-openssl-rand-hex-32/$WEBHOOK_TOKEN/g" .env
  sed -i '' "s/generate-with-openssl-rand-base64-32/$WEBHOOK_SECRET/g" .env
  
  echo "✅ Generated .env file with secure secrets"
  echo "⚠️  IMPORTANT: Review and update .env with your actual credentials"
  echo "⚠️  Never commit .env to version control!"
else
  echo "✅ .env file already exists"
fi
```

#### Testing

```bash
# tests/test-config-loader.js
const configLoader = require('../ops-automation/lib/config-loader');
const assert = require('assert');

// Test 1: Environment variable substitution
process.env.TEST_VAR = 'test-value';
const config = configLoader.loadConfig('test-config.json');
assert.strictEqual(config.testField, 'test-value');
console.log('✅ Test 1 passed: Env var substitution');

// Test 2: Missing required variable
try {
  configLoader.getEnv('NONEXISTENT_VAR');
  console.error('❌ Test 2 failed: Should throw for missing var');
} catch (e) {
  console.log('✅ Test 2 passed: Throws for missing var');
}

// Test 3: Validation
try {
  configLoader.validateEnv(['VAR1', 'VAR2', 'VAR3']);
  console.error('❌ Test 3 failed: Should throw for missing vars');
} catch (e) {
  console.log('✅ Test 3 passed: Validation detects missing vars');
}
```

---

## 🟠 HIGH Priority

### 4. Input Validation Framework

**Issue**: SEC-008  
**Risk Score**: 7.3  
**Effort**: 14 hours  
**Impact**: Prevents injection attacks and crashes

#### Implementation

**File**: `ops-automation/lib/input-validator.js` (new file)

```javascript
/**
 * Input Validation Framework
 * Validates webhook payloads, alert data, and user inputs
 */

const Joi = require('joi');

// Schema for alert webhook payload
const alertWebhookSchema = Joi.object({
  source: Joi.string()
    .alphanum()
    .max(100)
    .required()
    .description('Source system (e.g., prometheus, datadog)'),
  
  timestamp: Joi.date()
    .iso()
    .optional()
    .description('Alert timestamp'),
  
  alerts: Joi.array()
    .items(
      Joi.object({
        severity: Joi.string()
          .valid('critical', 'warning', 'info')
          .required()
          .description('Alert severity level'),
        
        metric: Joi.string()
          .pattern(/^[a-z_]+$/)
          .max(50)
          .required()
          .description('Metric name (lowercase, underscores only)'),
        
        value: Joi.number()
          .min(0)
          .max(1000000)
          .required()
          .description('Current metric value'),
        
        threshold: Joi.number()
          .min(0)
          .max(1000000)
          .required()
          .description('Alert threshold'),
        
        message: Joi.string()
          .max(500)
          .required()
          .description('Human-readable message'),
        
        labels: Joi.object()
          .pattern(Joi.string(), Joi.string())
          .optional()
          .description('Additional labels')
      })
    )
    .min(1)
    .max(100)
    .required()
    .description('Array of alerts (max 100)')
});

// Schema for AutoHeal incident
const incidentSchema = Joi.object({
  type: Joi.string()
    .valid(
      'disk_space_low',
      'process_down',
      'memory_leak',
      'api_slow',
      'ssl_expiring'
    )
    .required(),
  
  severity: Joi.string()
    .valid('critical', 'warning', 'info')
    .required(),
  
  metric: Joi.string()
    .pattern(/^[a-z_]+$/)
    .max(50)
    .required(),
  
  value: Joi.number().required(),
  threshold: Joi.number().required(),
  
  metadata: Joi.object()
    .optional()
});

class InputValidator {
  /**
   * Validate alert webhook payload
   * @param {object} payload - Raw webhook payload
   * @returns {object} Validated and sanitized payload
   * @throws {Error} If validation fails
   */
  validateAlertWebhook(payload) {
    return this._validate(alertWebhookSchema, payload, 'Alert webhook');
  }
  
  /**
   * Validate AutoHeal incident
   * @param {object} incident - Incident data
   * @returns {object} Validated incident
   * @throws {Error} If validation fails
   */
  validateIncident(incident) {
    return this._validate(incidentSchema, incident, 'Incident');
  }
  
  /**
   * Generic validation helper
   * @private
   */
  _validate(schema, data, contextName) {
    const { error, value } = schema.validate(data, {
      abortEarly: false,  // Collect all errors
      stripUnknown: true, // Remove unknown fields
      convert: true       // Type coercion
    });
    
    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      throw new ValidationError(`${contextName} validation failed: ${details}`);
    }
    
    return value;
  }
  
  /**
   * Sanitize string input (remove HTML/scripts)
   * @param {string} input - User input string
   * @returns {string} Sanitized string
   */
  sanitizeString(input) {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]+>/g, '')                      // Remove HTML tags
      .replace(/[^\x20-\x7E]/g, '')                 // Remove non-printable
      .trim()
      .slice(0, 1000);                              // Max length
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

module.exports = new InputValidator();
module.exports.ValidationError = ValidationError;
```

**Package.json addition**:

```json
{
  "dependencies": {
    "joi": "^17.11.0",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5"
  }
}
```

**Usage in Webhook Server**:

```javascript
// ops-automation/webhook-server.js
const inputValidator = require('./lib/input-validator');
const { ValidationError } = require('./lib/input-validator');

app.post('/alerts/webhook', 
  webhookAuth.verify.bind(webhookAuth),
  async (req, res) => {
    try {
      // Validate input
      const validatedPayload = inputValidator.validateAlertWebhook(req.body);
      
      // Process validated alerts
      await handleAlert(validatedPayload);
      
      res.json({ status: 'ok', received: true });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: error.message 
        });
      }
      
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
```

#### Testing

```javascript
// tests/test-input-validator.js
const inputValidator = require('../ops-automation/lib/input-validator');
const { ValidationError } = require('../ops-automation/lib/input-validator');
const assert = require('assert');

describe('Input Validator', () => {
  it('should accept valid alert webhook', () => {
    const payload = {
      source: 'prometheus',
      alerts: [{
        severity: 'critical',
        metric: 'cpu_percent',
        value: 95,
        threshold: 90,
        message: 'CPU usage critical'
      }]
    };
    
    const validated = inputValidator.validateAlertWebhook(payload);
    assert.strictEqual(validated.source, 'prometheus');
  });
  
  it('should reject invalid severity', () => {
    const payload = {
      source: 'test',
      alerts: [{
        severity: 'INVALID',  // Not in valid list
        metric: 'cpu',
        value: 50,
        threshold: 80,
        message: 'Test'
      }]
    };
    
    assert.throws(
      () => inputValidator.validateAlertWebhook(payload),
      ValidationError
    );
  });
  
  it('should sanitize strings', () => {
    const malicious = '<script>alert("xss")</script>Hello';
    const sanitized = inputValidator.sanitizeString(malicious);
    assert.strictEqual(sanitized, 'Hello');
  });
});
```

---

### 5. Role-Based Access Control (RBAC)

**Issue**: SEC-005  
**Risk Score**: 7.1  
**Effort**: 18 hours  
**Impact**: Limits blast radius of compromised agents

#### Implementation

**File**: `ops-automation/lib/rbac.js` (new file)

```javascript
/**
 * Role-Based Access Control (RBAC) System
 * Controls which agents/users can perform which actions
 */

const fs = require('fs');
const path = require('path');

class RBACSystem {
  constructor(configPath = 'config/rbac.json') {
    this.configPath = configPath;
    this.reload();
  }
  
  /**
   * Reload RBAC configuration from file
   */
  reload() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(content);
      
      this.roles = config.roles || {};
      this.assignments = config.assignments || {};
      
      console.log(`✅ Loaded RBAC config: ${Object.keys(this.roles).length} roles`);
    } catch (error) {
      console.error(`⚠️  Failed to load RBAC config: ${error.message}`);
      this.roles = {};
      this.assignments = {};
    }
  }
  
  /**
   * Check if a principal has a specific permission
   * @param {string} principal - User or agent ID (e.g., 'agent:autoheal', 'user:alice')
   * @param {string} permission - Permission string (e.g., 'execute:disk_cleanup')
   * @returns {boolean} True if permission is granted
   */
  hasPermission(principal, permission) {
    const roles = this.getRoles(principal);
    
    if (roles.length === 0) {
      console.warn(`No roles assigned to principal: ${principal}`);
      return false;
    }
    
    for (const roleName of roles) {
      const role = this.roles[roleName];
      if (!role) continue;
      
      const permissions = role.permissions || [];
      
      for (const perm of permissions) {
        if (this._matchPermission(perm, permission)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get roles assigned to a principal
   * @param {string} principal - Principal ID
   * @returns {array} List of role names
   */
  getRoles(principal) {
    return this.assignments[principal] || [];
  }
  
  /**
   * Assign a role to a principal
   * @param {string} principal - Principal ID
   * @param {string} roleName - Role to assign
   */
  assignRole(principal, roleName) {
    if (!this.roles[roleName]) {
      throw new Error(`Role does not exist: ${roleName}`);
    }
    
    if (!this.assignments[principal]) {
      this.assignments[principal] = [];
    }
    
    if (!this.assignments[principal].includes(roleName)) {
      this.assignments[principal].push(roleName);
      this._saveConfig();
      
      this._logSecurityEvent({
        type: 'rbac_change',
        action: 'role_assigned',
        principal,
        role: roleName
      });
    }
  }
  
  /**
   * Remove a role from a principal
   * @param {string} principal - Principal ID
   * @param {string} roleName - Role to remove
   */
  revokeRole(principal, roleName) {
    if (this.assignments[principal]) {
      this.assignments[principal] = this.assignments[principal]
        .filter(r => r !== roleName);
      
      this._saveConfig();
      
      this._logSecurityEvent({
        type: 'rbac_change',
        action: 'role_revoked',
        principal,
        role: roleName
      });
    }
  }
  
  /**
   * Require permission (throws if not granted)
   * @param {string} principal - Principal ID
   * @param {string} permission - Required permission
   * @throws {PermissionDeniedError} If permission not granted
   */
  requirePermission(principal, permission) {
    if (!this.hasPermission(principal, permission)) {
      this._logSecurityEvent({
        type: 'authorization',
        action: 'permission_denied',
        principal,
        permission,
        severity: 'warning'
      });
      
      throw new PermissionDeniedError(
        `Principal '${principal}' does not have permission '${permission}'`
      );
    }
  }
  
  /**
   * Match a permission pattern against a requested permission
   * @private
   */
  _matchPermission(pattern, requested) {
    // Exact match
    if (pattern === requested) {
      return true;
    }
    
    // Wildcard (admin)
    if (pattern === '*') {
      return true;
    }
    
    // Prefix wildcard (e.g., 'execute:*' matches 'execute:disk_cleanup')
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1);
      return requested.startsWith(prefix);
    }
    
    return false;
  }
  
  /**
   * Save configuration to disk
   * @private
   */
  _saveConfig() {
    const config = {
      roles: this.roles,
      assignments: this.assignments
    };
    
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf8'
    );
  }
  
  /**
   * Log security event
   * @private
   */
  _logSecurityEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    
    const logPath = 'logs/security-audit.jsonl';
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  }
}

class PermissionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionDeniedError';
    this.statusCode = 403;
  }
}

module.exports = new RBACSystem();
module.exports.PermissionDeniedError = PermissionDeniedError;
```

**Configuration File**:

```json
// ops-automation/config/rbac.json
{
  "roles": {
    "viewer": {
      "description": "Read-only access to metrics and logs",
      "permissions": [
        "read:metrics",
        "read:logs",
        "read:reports",
        "read:incidents"
      ]
    },
    "operator": {
      "description": "Can execute safe commands and spawn monitoring agents",
      "permissions": [
        "read:*",
        "execute:safe_commands",
        "execute:disk_cleanup",
        "execute:docker_prune",
        "execute:reload_nginx",
        "spawn:metrics-collector",
        "spawn:logs-analyzer",
        "spawn:reporter"
      ]
    },
    "admin": {
      "description": "Full access to all operations",
      "permissions": [
        "*"
      ]
    }
  },
  "assignments": {
    "agent:metrics-collector": ["operator"],
    "agent:logs-analyzer": ["operator"],
    "agent:alert-handler": ["operator"],
    "agent:autoheal": ["operator"],
    "agent:reporter": ["viewer"],
    "agent:orchestrator": ["admin"],
    "user:admin": ["admin"]
  }
}
```

**Usage in AutoHeal**:

```javascript
// When executing a command
const rbac = require('./lib/rbac');
const { PermissionDeniedError } = require('./lib/rbac');

async function executeAutoHealAction(action, incident, agentId) {
  try {
    // Check permission
    const permission = `execute:${action.commandId}`;
    rbac.requirePermission(agentId, permission);
    
    // Permission granted - proceed with execution
    const result = await commandValidator.validateCommand(
      action.commandId,
      action.params
    );
    
    // ... execute command
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      console.error(`❌ Permission denied for ${agentId}: ${permission}`);
      // Log and escalate
      await escalatePermissionDenied(incident, agentId, permission);
    }
    throw error;
  }
}
```

---

### 6. Log Sanitization

**Issue**: SEC-007  
**Risk Score**: 6.5  
**Effort**: 10 hours  
**Impact**: Prevents sensitive data leakage

#### Implementation

**File**: `ops-automation/lib/log-sanitizer.js` (new file)

```javascript
/**
 * Log Sanitizer - Redacts sensitive information from logs
 */

class LogSanitizer {
  constructor() {
    // Patterns for sensitive data
    this.sensitivePatterns = [
      // API keys and tokens
      {
        pattern: /\b([Aa]pi[_-]?[Kk]ey|[Aa]uth[_-]?[Tt]oken|[Bb]earer)\s*[=:]\s*['"]?([A-Za-z0-9+/=]{20,})['"]?/g,
        replacement: (match, prefix) => `${prefix}=***REDACTED***`
      },
      
      // Passwords
      {
        pattern: /\b([Pp]assword|[Pp]ass|[Pp]wd)\s*[=:]\s*['"]?([^'"\s]+)['"]?/g,
        replacement: (match, prefix) => `${prefix}=***REDACTED***`
      },
      
      // Secrets
      {
        pattern: /\b([Ss]ecret|[Kk]ey)\s*[=:]\s*['"]?([^'"\s]+)['"]?/g,
        replacement: (match, prefix) => `${prefix}=***REDACTED***`
      },
      
      // Credit card numbers (basic PAN detection)
      {
        pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
        replacement: () => '****-****-****-****'
      },
      
      // Email addresses (optional - may want to keep in some cases)
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: (match) => {
          const [local, domain] = match.split('@');
          return `${local.slice(0, 2)}***@${domain}`;
        }
      },
      
      // IP addresses (internal/private IPs)
      {
        pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
        replacement: () => '***.***.***.***(private IP)'
      },
      
      // JWT tokens
      {
        pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
        replacement: () => 'eyJ***...(JWT token redacted)'
      },
      
      // Database connection strings
      {
        pattern: /\b(postgres|mysql|mongodb):\/\/([^:]+):([^@]+)@/g,
        replacement: (match, protocol) => `${protocol}://***:***@`
      },
      
      // AWS access keys
      {
        pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
        replacement: () => 'AKIA****************(redacted)'
      },
      
      // Private keys
      {
        pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----([\s\S]*?)-----END (RSA |EC )?PRIVATE KEY-----/g,
        replacement: () => '-----BEGIN PRIVATE KEY-----\n***REDACTED***\n-----END PRIVATE KEY-----'
      }
    ];
  }
  
  /**
   * Sanitize a log message
   * @param {string} message - Log message
   * @returns {string} Sanitized message
   */
  sanitize(message) {
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    let sanitized = message;
    
    for (const { pattern, replacement } of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize an object (recursively)
   * @param {object} obj - Object to sanitize
   * @returns {object} Sanitized object
   */
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if key indicates sensitive data
      const sensitiveKeys = ['password', 'secret', 'token', 'api_key', 'apikey'];
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Create a sanitizing winston transport
   * @returns {object} Winston transport
   */
  createWinstonFormat() {
    const { format } = require('winston');
    
    return format((info) => {
      if (info.message) {
        info.message = this.sanitize(info.message);
      }
      
      // Sanitize other fields
      for (const key of Object.keys(info)) {
        if (key !== 'level' && key !== 'timestamp') {
          if (typeof info[key] === 'string') {
            info[key] = this.sanitize(info[key]);
          } else if (typeof info[key] === 'object') {
            info[key] = this.sanitizeObject(info[key]);
          }
        }
      }
      
      return info;
    })();
  }
}

module.exports = new LogSanitizer();
```

**Usage**:

```javascript
// Auto Heal incident logging
const logSanitizer = require('./lib/log-sanitizer');

async function logIncident(incident, action, result) {
  const sanitizedOutput = logSanitizer.sanitize(result.output);
  const sanitizedCommand = logSanitizer.sanitize(action.command);
  
  await appendToFile(incidentFile, `
### ${action.description}
- **Command**: \`${sanitizedCommand}\`
- **Output**: 
\`\`\`
${sanitizedOutput}
\`\`\`
`);
}

// Winston integration
const winston = require('winston');
const logSanitizer = require('./lib/log-sanitizer');

const logger = winston.createLogger({
  format: winston.format.combine(
    logSanitizer.createWinstonFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/application.log' })
  ]
});

// Now all logs are automatically sanitized
logger.info('Database connected', { connectionString: 'postgres://user:password@localhost' });
// Logged as: { message: 'Database connected', connectionString: 'postgres://***:***@localhost' }
```

#### Testing

```javascript
// tests/test-log-sanitizer.js
const logSanitizer = require('../ops-automation/lib/log-sanitizer');
const assert = require('assert');

describe('Log Sanitizer', () => {
  it('should redact passwords', () => {
    const input = 'password=mysecretpass123';
    const output = logSanitizer.sanitize(input);
    assert.strictEqual(output, 'password=***REDACTED***');
  });
  
  it('should redact API keys', () => {
    const input = 'api_key=sk_live_abc123def456';
    const output = logSanitizer.sanitize(input);
    assert.strictEqual(output, 'api_key=***REDACTED***');
  });
  
  it('should redact credit cards', () => {
    const input = 'Card: 1234-5678-9012-3456';
    const output = logSanitizer.sanitize(input);
    assert.strictEqual(output, 'Card: ****-****-****-****');
  });
  
  it('should sanitize objects recursively', () => {
    const input = {
      username: 'alice',
      password: 'secret123',
      nested: {
        api_key: 'abc123'
      }
    };
    
    const output = logSanitizer.sanitizeObject(input);
    assert.strictEqual(output.username, 'alice');
    assert.strictEqual(output.password, '***REDACTED***');
    assert.strictEqual(output.nested.api_key, '***REDACTED***');
  });
});
```

---

## 🟡 MEDIUM Priority

### 7. Comprehensive Audit Logging

**Issue**: SEC-009  
**Risk Score**: 5.3  
**Effort**: 12 hours

(See security-review-report.md for full implementation)

Key additions:
- Security event logging for all critical actions
- Tamper-proof log chain
- Integration with SIEM systems
- Failed authentication tracking

---

### 8. TLS/HTTPS Enforcement

**Issue**: SEC-010  
**Risk Score**: 5.9  
**Effort**: 10 hours

Key additions:
- HTTPS requirement for all external endpoints
- TLS client configuration for outbound requests
- Certificate validation
- Self-signed cert generation for dev/test

---

### 9. Rate Limiting

**Issue**: SEC-011  
**Risk Score**: 5.3  
**Effort**: 8 hours

Key additions:
- Webhook request rate limiting
- Per-source rate limits
- Redis-backed distributed rate limiting
- Automatic IP blocking for abuse

---

### 10. Dependency Security Scanning

**Issue**: SEC-012  
**Risk Score**: 4.3  
**Effort**: 6 hours

Key additions:
- Dependabot configuration
- npm audit in CI/CD
- Snyk or similar scanning
- Automated security updates

---

## 🟢 LOW Priority

### 11. Container Security Hardening

**Issue**: SEC-013  
**Risk Score**: 3.1  
**Effort**: 8 hours

(Implementation details in security-review-report.md)

---

### 12. Security Monitoring Dashboard

**Issue**: SEC-014  
**Risk Score**: 2.3  
**Effort**: 16 hours

Key additions:
- Real-time security metrics
- Failed auth attempt dashboard
- Anomaly detection alerts
- Security posture score

---

## Implementation Checklist

### Phase 1: Critical (Week 1-2)
- [ ] Implement command whitelist (`command-validator.js`)
- [ ] Update AutoHeal playbooks to use whitelisted commands
- [ ] Implement webhook authentication (`webhook-auth.js`)
- [ ] Implement secrets management (`config-loader.js`)
- [ ] Create `.env.example` and update docs
- [ ] Write tests for command validator
- [ ] Write tests for webhook auth
- [ ] Update `setup.sh` to generate secure secrets

### Phase 2: High (Week 3-4)
- [ ] Implement input validation (`input-validator.js`)
- [ ] Implement RBAC system (`rbac.js`)
- [ ] Create `rbac.json` configuration
- [ ] Implement log sanitization (`log-sanitizer.js`)
- [ ] Integrate sanitizer with winston
- [ ] Write tests for all new modules
- [ ] Update documentation

### Phase 3: Medium (Week 5-6)
- [ ] Implement audit logging system
- [ ] Set up TLS for webhook server
- [ ] Implement rate limiting
- [ ] Configure Dependabot
- [ ] Set up CI/CD security scans
- [ ] Create security monitoring scripts

### Phase 4: Low (Week 7-8)
- [ ] Harden Docker containers
- [ ] Build security dashboard
- [ ] Conduct penetration testing
- [ ] Write final security documentation
- [ ] Security training for operators

---

## Testing Strategy

### Unit Tests
```bash
npm test -- --grep "Security"
```

### Integration Tests
```bash
npm run test:integration
```

### Security Tests
```bash
npm run test:security
```

### Manual Testing
- Attempt command injection
- Test authentication bypass
- Verify RBAC enforcement
- Check log sanitization
- Test rate limiting

---

## Deployment Checklist

Before deploying to production:

- [ ] All Critical fixes implemented
- [ ] All High priority fixes implemented
- [ ] Security tests passing
- [ ] Penetration test completed
- [ ] `.env` configured with production secrets
- [ ] HTTPS/TLS enabled
- [ ] Rate limiting configured
- [ ] RBAC policies reviewed and approved
- [ ] Audit logging enabled and tested
- [ ] Security monitoring active
- [ ] Incident response plan documented
- [ ] Team trained on security features

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-02  
**Next Review**: After implementation of each phase
