# OpenClaw Ops Automation - AI Agents

This system consists of 9 specialized AI agents working together to monitor and automate infrastructure operations.

---

## 1. Orchestrator Agent

**Role**: Main coordinator and decision maker  
**Trigger**: Heartbeat (every 5 minutes) or on-demand  
**Responsibilities**:
- Schedule and coordinate other agents
- Make critical operational decisions
- Handle user requests and queries
- Monitor overall system health

**How it works**:
- Checks what tasks need to run based on time and state
- Spawns worker processes or other agents as needed
- Aggregates results and provides insights

---

## 2. Metrics Collector Agent

**Role**: System metrics collection  
**Trigger**: Cron (every 5 minutes)  
**Responsibilities**:
- Collect CPU, Memory, Disk, Network stats
- Monitor API response times
- Track process status
- Store metrics in time-series format

**Output**: `metrics/metrics-YYYY-MM-DD-HHmmss.json`

**Worker**: `workers/metrics-collector.js`

---

## 3. Logs Analyzer Agent

**Role**: Log analysis and anomaly detection  
**Trigger**: Cron (every 10 minutes)  
**Responsibilities**:
- Parse system and application logs
- Detect error patterns and anomalies
- Identify performance degradation signs
- Alert on suspicious activity

**Output**: `analysis/log-insights-YYYY-MM-DD-HHmmss.md`

**Worker**: `workers/logs-analyzer.js`

---

## 4. Alert Handler Agent

**Role**: Alert processing and triage  
**Trigger**: Event-based (webhook) or periodic  
**Responsibilities**:
- Receive alerts from monitoring systems
- Classify alert severity (info/warning/critical)
- Filter duplicate alerts
- Escalate to appropriate teams
- Trigger AutoHeal for known issues

**Worker**: `workers/alert-handler.js`

---

## 5. AutoHeal Agent

**Role**: Automated remediation  
**Trigger**: Called by Alert Handler or on-demand  
**Responsibilities**:
- Execute predefined playbooks for common issues
- Disk space cleanup (delete old logs, temp files)
- Process restart for crashed services
- Connection pool cleanup
- SSL certificate renewal

**Output**: `incidents/YYYY-MM-DD-{incident_id}.md`

**Worker**: `workers/autoheal.js`

**Playbooks**: Defined in `openclaw/config/autoheal-playbooks.json`

---

## 6. Reporter Agent

**Role**: Report generation  
**Trigger**: Cron (daily at 09:00, weekly Monday 10:00)  
**Responsibilities**:
- Generate daily system health reports
- Create weekly incident summaries
- Analyze trends and patterns
- Provide actionable insights

**Output**: `reports/ops-report-YYYY-MM-DD.md`

**Worker**: `workers/reporter.js`

---

## 7. SSH Agent

**Role**: Remote command execution  
**Trigger**: On-demand  
**Responsibilities**:
- Execute commands on remote servers
- Manage SSH connection pooling
- Handle authentication and security
- Support parallel execution

**Worker**: SSH functionality integrated in `src/ssh/`

**Security**: Whitelist-based command approval

---

## 8. Diagnostic Agent

**Role**: Deep system diagnostics  
**Trigger**: On-demand or when issues detected  
**Responsibilities**:
- CPU/Memory profiling
- Log collection and aggregation
- Network diagnostics
- Database connection analysis

**Worker**: Diagnostic tools in `src/diagnostic/`

---

## 9. Code Healer Agent

**Role**: Automated code patching  
**Trigger**: On-demand  
**Responsibilities**:
- Analyze code issues (memory leaks, connection leaks)
- Generate patches using predefined patterns
- Validate patches before applying
- Deploy patches with rollback capability
- Support canary and blue-green deployments

**Worker**: Code healing modules in `src/code-healer/`

---

## Agent Collaboration

```
User Request
     ↓
Orchestrator → Makes decision
     ↓
     ├─→ Metrics Collector → System stats
     ├─→ Logs Analyzer → Error patterns
     ├─→ Alert Handler → Issue detection
     │        ↓
     │   AutoHeal → Fix common issues
     │        ↓
     │   Reporter → Document incident
     └─→ Diagnostic Agent → Deep analysis
              ↓
         Code Healer → Automated patching
```

---

## Configuration

All agents are configured via JSON files in `openclaw/config/`:

- **monitoring-sources.json**: Data sources (Prometheus, logs, health checks)
- **alert-thresholds.json**: Alert thresholds (CPU, memory, disk, latency)
- **autoheal-playbooks.json**: Remediation playbooks
- **ssh-whitelist.json**: Allowed SSH commands
- **jsm-config.json**: Jira Service Management integration

---

## Deployment

See `openclaw/SKILL.md` for integration with OpenClaw.

For manual deployment:
```bash
bash openclaw/deploy.sh
bash openclaw/setup-cron.sh
```

---

## Security

- Agents run with least privilege
- SSH commands require whitelist approval
- Sensitive data encrypted at rest
- Audit logs for all automation actions
- Role-based access control (RBAC)
