# Ops Monitoring Skill

Use this skill to monitor infrastructure, collect system metrics, and automate operations.

---

## Installation

```bash
cd ~/.openclaw/workspace
git clone https://github.com/jawsbaek/openclaw-ops-automation.git ops-monitoring
cd ops-monitoring
npm install
bash openclaw/deploy.sh
```

This will:
- Install dependencies
- Create output directories (metrics, analysis, incidents, reports)
- Test worker functionality

---

## Commands

### Collect Current Metrics

```bash
cd ~/.openclaw/workspace/ops-monitoring && npm run worker:metrics
```

**Output**: `metrics/metrics-YYYY-MM-DD-HHmmss.json`

**Contains**:
- CPU usage (%)
- Memory usage (%)
- Disk usage (%)
- Network stats
- Process count
- API response times

**When to use**:
- User asks about system health
- Investigating performance issues
- Before/after deployments

---

### Analyze Recent Logs

```bash
cd ~/.openclaw/workspace/ops-monitoring && npm run worker:logs
```

**Output**: `analysis/log-insights-YYYY-MM-DD-HHmmss.md`

**Contains**:
- Error patterns
- Warning trends
- Anomaly detection
- Security alerts

**When to use**:
- Debugging issues
- Security investigation
- Trend analysis

---

### Generate Daily Report

```bash
cd ~/.openclaw/workspace/ops-monitoring && npm run worker:reporter
```

**Output**: `reports/ops-report-YYYY-MM-DD.md`

**Contains**:
- System health summary
- Incident count
- Performance trends
- Actionable recommendations

**When to use**:
- Daily standup preparation
- Weekly reviews
- Executive summaries

---

### Handle Alerts

```bash
cd ~/.openclaw/workspace/ops-monitoring && npm run worker:alert
```

**When to use**:
- Processing incoming alerts
- Triaging issues

---

### Auto-Heal Issues

```bash
cd ~/.openclaw/workspace/ops-monitoring && npm run worker:autoheal
```

**When to use**:
- Automated remediation
- Disk space cleanup
- Process restart

---

## Quick Checks

### Check Latest Metrics

```bash
cat $(ls -t ~/.openclaw/workspace/ops-monitoring/metrics/*.json | head -1)
```

Returns the most recent metrics file.

### Check Latest Analysis

```bash
cat $(ls -t ~/.openclaw/workspace/ops-monitoring/analysis/*.md | head -1)
```

Returns the most recent log analysis.

### Check Latest Report

```bash
cat $(ls -t ~/.openclaw/workspace/ops-monitoring/reports/*.md | head -1)
```

Returns the most recent ops report.

---

## Automation with Cron

Setup automated monitoring:

```bash
cd ~/.openclaw/workspace/ops-monitoring
bash openclaw/setup-cron.sh
```

This will show you commands to register cron jobs in OpenClaw:

- **Metrics collection**: Every 5 minutes
- **Log analysis**: Every 10 minutes
- **Daily report**: Every day at 09:00

---

## Usage Patterns

### Pattern 1: Health Check

**User asks**: "How is the system doing?"

**Your response**:
1. Run metrics collection:
   ```bash
   cd ~/.openclaw/workspace/ops-monitoring && npm run worker:metrics
   ```
2. Read the latest metrics file
3. Summarize key points:
   - CPU: X%
   - Memory: Y%
   - Disk: Z%
   - Status: Healthy / Warning / Critical

### Pattern 2: Issue Investigation

**User asks**: "Why is the API slow?"

**Your response**:
1. Collect current metrics (system load)
2. Analyze recent logs (error patterns)
3. Check for:
   - High CPU/Memory usage
   - Error spikes
   - Database connection issues
4. Suggest remediation:
   - Restart service
   - Clean up resources
   - Scale up if needed

### Pattern 3: Daily Routine (via Heartbeat)

**Every morning (09:00)**:
1. Check if daily report exists for today
2. If not, generate it:
   ```bash
   npm run worker:reporter
   ```
3. Read the report
4. Summarize key points for user:
   - Overall health
   - Incidents overnight
   - Recommendations

### Pattern 4: Proactive Monitoring

**Every heartbeat check**:
1. Check last metrics timestamp:
   ```bash
   ls -t metrics/*.json | head -1
   ```
2. If >10 minutes old:
   - Alert: "Metrics collection may be stuck"
   - Manually run: `npm run worker:metrics`

3. Check for critical alerts:
   ```bash
   grep -i "CRITICAL" analysis/*.md | tail -5
   ```
4. If found:
   - Alert user immediately
   - Suggest investigation

---

## Configuration

All configuration files are in `openclaw/config/`:

### Monitoring Sources

Edit `openclaw/config/monitoring-sources.json`:

```json
{
  "prometheus": {
    "enabled": true,
    "endpoint": "http://localhost:9090"
  },
  "logs": {
    "paths": [
      "/var/log/system.log",
      "/tmp/openclaw/*.log"
    ]
  }
}
```

### Alert Thresholds

Edit `openclaw/config/alert-thresholds.json`:

```json
{
  "cpu_usage": {"warning": 70, "critical": 90},
  "memory_usage": {"warning": 80, "critical": 95},
  "disk_usage": {"warning": 75, "critical": 90}
}
```

### AutoHeal Playbooks

Edit `openclaw/config/autoheal-playbooks.json`:

```json
{
  "disk_space_low": {
    "condition": "disk_usage > 90",
    "actions": [
      "find /tmp -type f -mtime +7 -delete",
      "docker system prune -f"
    ]
  }
}
```

---

## Advanced: JSM Integration

Jira Service Management integration for incident tracking.

Configuration: `openclaw/config/jsm-config.json`

Features:
- Auto-create incidents
- Update ticket status
- Link incidents to alerts

See `ops-automation/src/jsm/` for implementation.

---

## Output Directories

```
ops-monitoring/
├── metrics/      # System metrics (JSON, time-series)
├── analysis/     # Log analysis results (Markdown)
├── incidents/    # Incident records (Markdown)
├── reports/      # Daily/weekly reports (Markdown)
└── logs/         # Worker logs
```

---

## Troubleshooting

### Workers not running

```bash
# Check if dependencies are installed
npm list

# Reinstall
npm install
```

### No metrics collected

```bash
# Run manually with debug
DEBUG=* npm run worker:metrics
```

### Cron jobs not firing

```bash
# Check OpenClaw cron status
cron list

# Re-register
bash openclaw/setup-cron.sh
```

---

## Security Notes

- Workers run with least privilege
- SSH commands require whitelist (`openclaw/config/ssh-whitelist.json`)
- Sensitive data encrypted at rest
- All automation actions are logged

---

## Further Reading

- `openclaw/AGENTS.md`: Agent architecture and responsibilities
- `ops-automation/README.md`: Module documentation
- `SECURITY.md`: Security best practices
