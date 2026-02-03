# OpenClaw Ops Automation

AI-powered infrastructure monitoring and automation for OpenClaw.

[![Tests](https://github.com/jawsbaek/openclaw-ops-automation/actions/workflows/ci.yml/badge.svg)](https://github.com/jawsbaek/openclaw-ops-automation/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Quick Start

```bash
cd ~/.openclaw/workspace
git clone https://github.com/jawsbaek/openclaw-ops-automation.git ops-monitoring
cd ops-monitoring
npm install
bash openclaw/deploy.sh
```

Then setup automated monitoring:

```bash
bash openclaw/setup-cron.sh
```

---

## 📊 Features

- **🔍 Metrics Collection**: CPU, Memory, Disk, Network stats (every 5 min)
- **📊 Log Analysis**: Error patterns, anomaly detection (every 10 min)
- **🚨 Alert Handling**: Automated triage and escalation
- **🔧 Auto-Healing**: Automated remediation for common issues
- **📝 Reporting**: Daily/weekly ops reports
- **🔐 SSH Automation**: Remote command execution
- **🩺 Deep Diagnostics**: CPU/Memory profiling, log aggregation
- **💊 Code Healing**: Automated patching for code issues
- **🎫 JSM Integration**: Jira Service Management incident tracking

---

## 🏗️ Architecture

9 specialized AI agents working together:

| Agent | Role | Trigger | Output |
|-------|------|---------|--------|
| **Orchestrator** | Main coordinator | Heartbeat (5min) | - |
| **Metrics Collector** | System stats | Cron (5min) | `metrics/*.json` |
| **Logs Analyzer** | Log analysis | Cron (10min) | `analysis/*.md` |
| **Alert Handler** | Alert triage | Event-based | - |
| **AutoHeal** | Auto-remediation | On-demand | `incidents/*.md` |
| **Reporter** | Report generation | Cron (daily 09:00) | `reports/*.md` |
| **SSH Agent** | Remote execution | On-demand | - |
| **Diagnostic Agent** | Deep diagnostics | On-demand | - |
| **Code Healer** | Automated patching | On-demand | - |

See [`openclaw/AGENTS.md`](openclaw/AGENTS.md) for detailed architecture.

---

## 📚 Documentation

- **[`openclaw/AGENTS.md`](openclaw/AGENTS.md)** - AI agent architecture and responsibilities
- **[`openclaw/SKILL.md`](openclaw/SKILL.md)** - OpenClaw skill usage guide
- **[`ops-automation/README.md`](ops-automation/README.md)** - Module documentation
- **[`SECURITY.md`](SECURITY.md)** - Security best practices

---

## 🔧 Usage

### Manual Execution

```bash
# Collect current metrics
npm run worker:metrics

# Analyze recent logs
npm run worker:logs

# Generate daily report
npm run worker:reporter

# Handle alerts
npm run worker:alert

# Run auto-healing
npm run worker:autoheal
```

### OpenClaw Skill Integration

Use this repository as an OpenClaw skill. See [`openclaw/SKILL.md`](openclaw/SKILL.md) for patterns:

- **Health checks**: Collect metrics on-demand
- **Issue investigation**: Analyze logs when problems arise
- **Daily routine**: Generate reports via heartbeat
- **Proactive monitoring**: Detect issues before they escalate

### Automated Monitoring (Cron)

Setup cron jobs for continuous monitoring:

```bash
bash openclaw/setup-cron.sh
```

This will show you commands to register in OpenClaw:
- Metrics collection (every 5 minutes)
- Log analysis (every 10 minutes)
- Daily report (every day at 09:00)

---

## ⚙️ Configuration

All configuration files are in [`openclaw/config/`](openclaw/config/):

| File | Purpose |
|------|---------|
| `monitoring-sources.json` | Data sources (Prometheus, logs, APIs) |
| `alert-thresholds.json` | Alert thresholds (CPU, memory, disk, latency) |
| `autoheal-playbooks.json` | Remediation playbooks |
| `ssh-whitelist.json` | Allowed SSH commands (security) |
| `jsm-config.json` | Jira Service Management integration |

---

## 🧪 Development

### Run Tests

```bash
npm test                  # Run all tests
npm test -- --watch       # Watch mode
npm run lint              # Lint code
npm run lint:fix          # Auto-fix lint issues
```

### Add New Worker

1. Create `ops-automation/workers/your-worker.js`
2. Add tests in `ops-automation/__tests__/workers/your-worker.test.js`
3. Add script to `package.json`:
   ```json
   "worker:your-worker": "node workers/your-worker.js"
   ```
4. Document in `openclaw/AGENTS.md` and `openclaw/SKILL.md`

---

## 🔒 Security

- Workers run with least privilege
- SSH commands require whitelist approval (`openclaw/config/ssh-whitelist.json`)
- Sensitive data encrypted at rest
- All automation actions are logged
- Role-based access control (RBAC) for alert escalation

See [`SECURITY.md`](SECURITY.md) for detailed security guidelines.

---

## 📊 Output Directories

```
ops-monitoring/
├── metrics/      # System metrics (JSON, time-series)
├── analysis/     # Log analysis results (Markdown)
├── incidents/    # Incident records (Markdown)
├── reports/      # Daily/weekly reports (Markdown)
└── logs/         # Worker logs
```

All directories are excluded from git but preserved with `.gitkeep` files.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Lint your code (`npm run lint:fix`)
6. Commit changes (`git commit -m 'Add amazing feature'`)
7. Push to branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

---

## 📝 License

MIT License - see [`LICENSE`](LICENSE) for details.

---

## 🌟 Related Projects

- **[OpenClaw](https://github.com/openclaw/openclaw)** - AI agent framework
- **[Prometheus](https://prometheus.io/)** - Metrics collection
- **[Grafana](https://grafana.com/)** - Metrics visualization
- **[ELK Stack](https://www.elastic.co/elk-stack)** - Log management

---

## 📞 Support

- **Documentation**: [`openclaw/SKILL.md`](openclaw/SKILL.md), [`openclaw/AGENTS.md`](openclaw/AGENTS.md)
- **Issues**: [GitHub Issues](https://github.com/jawsbaek/openclaw-ops-automation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jawsbaek/openclaw-ops-automation/discussions)

---

**Built with ❤️ for OpenClaw**
