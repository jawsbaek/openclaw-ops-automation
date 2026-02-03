# OpenClaw Ops Automation - Modules

This directory contains the core modules for OpenClaw Ops Automation.

---

## 📁 Directory Structure

```
ops-automation/
├── workers/          # Executable workers (Node.js scripts)
│   ├── orchestrator.js
│   ├── metrics-collector.js
│   ├── logs-analyzer.js
│   ├── alert-handler.js
│   ├── autoheal.js
│   └── reporter.js
├── src/              # Library modules
│   ├── ssh/         # SSH remote execution
│   ├── diagnostic/  # System diagnostics
│   ├── code-healer/ # Automated patching
│   └── jsm/         # Jira Service Management integration
├── lib/              # Common utilities
│   ├── logger.js
│   ├── config-loader.js
│   ├── file-utils.js
│   └── platform.js
├── __tests__/        # Test suites
└── examples/         # Example scenarios
```

---

## 🔧 Workers

Workers are executable Node.js scripts that perform specific operations tasks.

### orchestrator.js
Main coordinator that schedules and manages other workers.

**Usage**:
```bash
npm run worker:orchestrator
```

### metrics-collector.js
Collects system metrics (CPU, Memory, Disk, Network).

**Usage**:
```bash
npm run worker:metrics
```

**Output**: `metrics/metrics-YYYY-MM-DD-HHmmss.json`

### logs-analyzer.js
Analyzes logs for patterns, errors, and anomalies.

**Usage**:
```bash
npm run worker:logs
```

**Output**: `analysis/log-insights-YYYY-MM-DD-HHmmss.md`

### alert-handler.js
Processes and triages alerts from monitoring systems.

**Usage**:
```bash
npm run worker:alert
```

### autoheal.js
Executes automated remediation playbooks.

**Usage**:
```bash
npm run worker:autoheal
```

**Output**: `incidents/YYYY-MM-DD-{incident_id}.md`

### reporter.js
Generates daily and weekly operational reports.

**Usage**:
```bash
npm run worker:reporter
```

**Output**: `reports/ops-report-YYYY-MM-DD.md`

---

## 📚 Library Modules

### src/ssh/
SSH remote execution with connection pooling.

**Modules**:
- `connection-pool.js`: Manage SSH connection pool
- `remote-executor.js`: Execute commands on remote hosts

**Usage**:
```javascript
import RemoteExecutor from './src/ssh/remote-executor.js';

const executor = new RemoteExecutor(config);
await executor.execute('uptime', ['host1', 'host2']);
```

### src/diagnostic/
Deep system diagnostics and profiling.

**Modules**:
- `profiler.js`: CPU/Memory profiling
- `log-collector.js`: Log aggregation

**Usage**:
```javascript
import Profiler from './src/diagnostic/profiler.js';

const profiler = new Profiler();
const profile = await profiler.profile();
```

### src/code-healer/
Automated code patching and deployment.

**Modules**:
- `patch-generator.js`: Generate patches from issue analysis
- `deploy-manager.js`: Deploy patches with canary/blue-green
- `rollback.js`: Rollback failed deployments

**Usage**:
```javascript
import PatchGenerator from './src/code-healer/patch-generator.js';

const generator = new PatchGenerator();
const patch = await generator.generatePatch(issue);
```

### src/jsm/
Jira Service Management integration.

**Modules**:
- `jsm-client.js`: JSM API client
- `jsm-integration.js`: Incident lifecycle management

**Usage**:
```javascript
import JSMClient from './src/jsm/jsm-client.js';

const client = new JSMClient(config);
await client.createIncident(alert);
```

### lib/
Common utilities shared across modules.

**Modules**:
- `logger.js`: Winston-based logging
- `config-loader.js`: Configuration management
- `file-utils.js`: File operations
- `platform.js`: Cross-platform helpers

**Usage**:
```javascript
import createLogger from './lib/logger.js';

const logger = createLogger('my-module');
logger.info('Hello, world!');
```

---

## 🧪 Testing

All modules have corresponding test suites in `__tests__/`.

**Run tests**:
```bash
npm test                  # Run all tests
npm test -- --watch       # Watch mode
npm run test:ui           # UI mode (Vitest)
```

**Test coverage**:
```bash
npm test -- --coverage
```

---

## ⚙️ Configuration

Configuration files are in `openclaw/config/`:

- **monitoring-sources.json**: Data sources
- **alert-thresholds.json**: Alert thresholds
- **autoheal-playbooks.json**: Remediation playbooks
- **ssh-whitelist.json**: Allowed SSH commands
- **jsm-config.json**: JSM integration settings

---

## 📖 Examples

See `examples/` for usage scenarios:

- `01-basic-usage.md`: Basic worker usage
- `02-configuration.md`: Configuration examples
- `03-integration.md`: Integration patterns

---

## 🔒 Security

- Workers run with least privilege
- SSH commands require whitelist approval
- Sensitive data encrypted at rest
- All actions logged for audit

See `../SECURITY.md` for security guidelines.

---

## 📚 Documentation

- **AI Agents**: See `../openclaw/AGENTS.md`
- **OpenClaw Skill**: See `../openclaw/SKILL.md`
- **API Reference**: Run `npm run docs` (JSDoc)

---

## 🤝 Contributing

When adding new modules:

1. Create module in appropriate directory (`workers/`, `src/`, `lib/`)
2. Add tests in `__tests__/`
3. Document in this README
4. Update `../openclaw/AGENTS.md` if adding a worker
5. Update `../openclaw/SKILL.md` if adding user-facing functionality

---

**For project overview, see [`../README.md`](../README.md)**
