# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenClaw Ops Automation is an AI-powered distributed operations monitoring system with 6 autonomous agents that collaborate to monitor infrastructure, analyze logs, handle alerts, and automate remediation. It also includes a PR automation system with AI-powered code review and auto-merge.

## Commands

### Development
```bash
npm install                    # Install dependencies
npm test                       # Run tests with coverage
npm run test:watch             # Run tests in watch mode
npm run lint                   # Check code with Biome
npm run lint:fix               # Auto-fix lint issues
npm run format                 # Format code with Biome
npm run check                  # Full check: format + lint + test
```

### Running a Single Test
```bash
npm test -- ops-automation/__tests__/lib/logger.test.js
npm test -- --testNamePattern="should do something"
```

### Running Agents
```bash
npm run start:orchestrator     # Main coordinator agent
npm run start:metrics          # Metrics collector
npm run start:logs             # Logs analyzer
npm run start:alert            # Alert handler
npm run start:autoheal         # Auto-remediation agent
npm run start:reporter         # Report generator
```

### Documentation
```bash
npm run docs                   # Generate JSDoc documentation
```

## Architecture

### Agent System (`ops-automation/agents/`)

Six autonomous agents coordinate via the Orchestrator:

1. **Orchestrator** - Central coordinator with heartbeat scheduling (5min metrics, 10min logs, 2min alerts)
2. **Metrics Collector** - Gathers CPU, memory, disk, network metrics; outputs to `metrics/`
3. **Logs Analyzer** - Detects error patterns and anomalies; outputs to `analysis/`
4. **Alert Handler** - Evaluates thresholds, deduplicates alerts, triggers AutoHeal
5. **AutoHeal** - Executes playbook-based remediation (disk cleanup, restarts); outputs to `incidents/`
6. **Reporter** - Generates daily/weekly reports; outputs to `reports/`

### Supporting Libraries (`ops-automation/lib/`)
- `logger.js` - Winston-based logging
- `config-loader.js` - JSON configuration loader
- `file-utils.js` - File I/O operations

### SSH Module (`ops-automation/src/ssh/`)
- `connection-pool.js` - SSH connection pooling
- `remote-executor.js` - Remote command execution with whitelist

### PR Automation (`scripts/`)
- `pr-reviewer.js` - AI-powered code review with scoring (8/10 threshold for auto-approval)
- `security-scanner.js` - Detects secrets (11 patterns) and injection vulnerabilities (5 patterns)
- `auto-merger.js` - Conditional merge with safety checks

### Configuration (`ops-automation/config/`)
- `monitoring-sources.json` - Prometheus, healthchecks, log sources
- `alert-thresholds.json` - CPU, memory, disk, latency thresholds
- `autoheal-playbooks.json` - Remediation scripts
- `ssh-whitelist.json` - Allowed SSH commands

### GitHub Workflows (`.github/workflows/`)
- `ci.yml` - Main CI pipeline (Node 18.x, 20.x, 22.x matrix)
- `pr-auto-review.yml` - Code quality, security scan, AI review
- `pr-auto-merge.yml` - Conditional auto-merge with safety checks

## Code Style

Uses **Biome** (not ESLint) for linting and formatting:
- ES modules (`"type": "module"` in package.json)
- 2-space indentation
- Single quotes
- Semicolons required
- 120 character line width
- Trailing commas: none

## Testing

- Framework: Jest with ES modules (`--experimental-vm-modules`)
- Test files: `ops-automation/__tests__/**/*.test.js`
- Coverage threshold: 15% minimum
- Test timeout: 15 seconds

## Key Configuration Files

- `biome.json` - Linter/formatter config
- `jest.config.js` - Test configuration
- `.github/auto-review-config.yml` - PR automation settings (author whitelist, merge strategy, review criteria)
