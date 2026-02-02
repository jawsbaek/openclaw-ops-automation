# Example 1: Basic Usage

This example demonstrates basic usage of the OpenClaw Ops Automation agents.

## Prerequisites

- Node.js >= 18.0.0
- npm installed
- Configuration files set up

## Running Individual Agents

### 1. Collect Metrics

```bash
node ops-automation/agents/metrics-collector.js
```

This will:
- Collect current system metrics (CPU, memory, disk)
- Check configured healthcheck endpoints
- Query Prometheus (if enabled)
- Save results to `metrics/metrics-YYYY-MM-DD.json`

**Output Example:**
```json
{
  "timestamp": "2024-02-01T10:30:00.000Z",
  "system": {
    "cpu": 45.2,
    "memory": {
      "total": 16000,
      "used": 8000,
      "percentage": 50
    },
    "disk": [
      {
        "device": "/dev/disk1",
        "mount": "/",
        "percentage": 65
      }
    ]
  },
  "healthchecks": [
    {
      "name": "API",
      "url": "http://localhost:8080/health",
      "status": "healthy",
      "latency": 45
    }
  ]
}
```

### 2. Analyze Logs

```bash
node ops-automation/agents/logs-analyzer.js
```

This will:
- Read configured log files
- Detect error patterns and anomalies
- Generate markdown analysis report
- Save to `analysis/log-insights-YYYY-MM-DD.md`

**Output:**
```
✅ Log analysis complete
📄 Report: analysis/log-insights-2024-02-01T10-35-00.md
🔍 Issues found: 12 (2 critical, 5 errors, 5 warnings)
⚠️  Anomalies detected: 1
```

### 3. Process Alerts

```bash
node ops-automation/agents/alert-handler.js
```

This will:
- Load latest metrics
- Evaluate against configured thresholds
- Generate alerts for threshold violations
- Deduplicate alerts
- Trigger AutoHeal if appropriate

**Output:**
```
🔔 Processing alerts...
⚠️  Alert: CPU usage critical (95% >= 90%)
⚠️  Alert: Disk usage high (87% >= 85%)
🤖 Triggering AutoHeal for disk_usage
✅ 2 alerts processed, 1 AutoHeal triggered
```

### 4. Run AutoHeal

```bash
# Manually trigger AutoHeal for a scenario
node ops-automation/agents/autoheal.js disk_space_low
```

This will:
- Load the appropriate playbook
- Execute healing actions in sequence
- Generate incident report
- Save to `incidents/YYYY-MM-DD-heal-*.md`

**Output:**
```
🚑 Starting AutoHeal for: disk_space_low
📋 Executing playbook: disk_space_low
✅ Action 1/3: find /tmp -type f -mtime +7 -delete
✅ Action 2/3: find /var/log -name '*.log.*' -mtime +30 -delete
✅ Action 3/3: docker system prune -f
✅ AutoHeal completed successfully
📄 Incident report: incidents/2024-02-01-heal-1706783400000.md
```

### 5. Generate Reports

```bash
# Daily report
node ops-automation/agents/reporter.js daily

# Weekly report
node ops-automation/agents/reporter.js weekly
```

This will:
- Analyze recent metrics
- Summarize incidents
- Generate recommendations
- Save to `reports/ops-report-{type}-YYYY-MM-DD.md`

**Daily Report Output:**
```markdown
# Daily Operations Report

**Generated:** 2024-02-01T09:00:00.000Z
**Period:** Last 24 hours

## Executive Summary
- **Metrics Collected:** 288 data points
- **Incidents:** 3
- **Log Analyses:** 12

## System Health
### CPU Usage
- **Average:** 45.23%
- **Peak:** 78.50%
- **Status:** ✅ Normal

### Memory Usage
- **Average:** 62.15%
- **Peak:** 85.00%
- **Status:** ⚠️ High

## Recommendations
- 🟡 **Memory**: Peak usage reached 85%. Monitor for leaks.
- ✅ **All other systems nominal**
```

## Running the Orchestrator

The orchestrator coordinates all agents automatically:

```bash
# Run once (one heartbeat cycle)
node ops-automation/agents/orchestrator.js once

# Run continuously (daemon mode)
node ops-automation/agents/orchestrator.js continuous
```

**Continuous Mode Output:**
```
🎯 Orchestrator starting (heartbeat: 60s)
⏰ Heartbeat #1
  📊 Running metrics collection... ✅
  📝 Running log analysis... ✅
  🔔 Checking alerts... ⚠️ 2 alerts
  🤖 AutoHeal triggered for alert: disk_usage_/
  
⏰ Heartbeat #2
  📊 Metrics skipped (too soon)
  📝 Logs skipped (too soon)
  🔔 Checking alerts... ✅ No alerts
  
⏰ Heartbeat #3 (9:00 AM)
  📊 Running metrics collection... ✅
  📝 Running log analysis... ✅
  🔔 Checking alerts... ✅ No alerts
  📈 Generating daily report... ✅
```

## Next Steps

- See [02-configuration.md](./02-configuration.md) for customizing thresholds and playbooks
- See [03-integration.md](./03-integration.md) for integrating with monitoring tools
- See [04-custom-agents.md](./04-custom-agents.md) for creating custom agents
