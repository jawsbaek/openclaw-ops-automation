# Example 2: Configuration

This example shows how to configure the ops automation agents for your environment.

## Configuration Files

All configuration is stored in `ops-automation/config/`:

```
config/
├── monitoring-sources.json     # Where to collect metrics from
├── alert-thresholds.json       # When to trigger alerts
└── autoheal-playbooks.json     # How to fix common problems
```

## Monitoring Sources

**File:** `ops-automation/config/monitoring-sources.json`

### Basic Configuration

```json
{
  "logs": {
    "paths": [
      "/var/log/system.log",
      "/tmp/myapp/*.log"
    ]
  },
  "healthchecks": [
    {
      "name": "My API",
      "url": "http://localhost:3000/health",
      "interval": 60
    }
  ]
}
```

### With Prometheus

```json
{
  "prometheus": {
    "enabled": true,
    "endpoint": "http://localhost:9090",
    "queries": {
      "cpu": "rate(node_cpu_seconds_total[5m])",
      "memory": "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes",
      "disk": "node_filesystem_avail_bytes / node_filesystem_size_bytes",
      "api_latency": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
    }
  },
  "logs": {
    "paths": [
      "/var/log/nginx/access.log",
      "/var/log/nginx/error.log",
      "/var/log/myapp/*.log"
    ]
  },
  "healthchecks": [
    {
      "name": "Web Server",
      "url": "http://localhost:80/health",
      "interval": 30
    },
    {
      "name": "Database",
      "url": "http://localhost:5432/health",
      "interval": 60
    },
    {
      "name": "Redis",
      "url": "http://localhost:6379/ping",
      "interval": 60
    }
  ]
}
```

## Alert Thresholds

**File:** `ops-automation/config/alert-thresholds.json`

### Default Thresholds

```json
{
  "cpu_usage": {
    "warning": 70,
    "critical": 90
  },
  "memory_usage": {
    "warning": 80,
    "critical": 95
  },
  "disk_usage": {
    "warning": 75,
    "critical": 90
  },
  "api_latency_ms": {
    "warning": 500,
    "critical": 2000
  },
  "error_rate_per_min": {
    "warning": 10,
    "critical": 50
  }
}
```

### Customized for Production

```json
{
  "cpu_usage": {
    "warning": 60,
    "critical": 80
  },
  "memory_usage": {
    "warning": 70,
    "critical": 85
  },
  "disk_usage": {
    "warning": 70,
    "critical": 85
  },
  "api_latency_ms": {
    "warning": 300,
    "critical": 1000
  },
  "error_rate_per_min": {
    "warning": 5,
    "critical": 20
  },
  "database_connections": {
    "warning": 80,
    "critical": 95
  },
  "queue_depth": {
    "warning": 1000,
    "critical": 5000
  }
}
```

## AutoHeal Playbooks

**File:** `ops-automation/config/autoheal-playbooks.json`

### Basic Playbooks

```json
{
  "disk_space_low": {
    "condition": "disk_usage > 90",
    "actions": [
      "find /tmp -type f -mtime +7 -delete",
      "find /var/log -name '*.log.*' -mtime +30 -delete"
    ]
  },
  "process_down": {
    "condition": "process_status == 'stopped'",
    "actions": [
      "systemctl restart {service_name}"
    ]
  }
}
```

### Extended Playbooks

```json
{
  "disk_space_low": {
    "condition": "disk_usage > 90",
    "actions": [
      "echo 'Cleaning old temp files...'",
      "find /tmp -type f -mtime +7 -delete",
      "find /var/tmp -type f -mtime +7 -delete",
      "echo 'Rotating old logs...'",
      "find /var/log -name '*.log.*' -mtime +30 -delete",
      "echo 'Cleaning Docker resources...'",
      "docker system prune -f --volumes"
    ]
  },
  
  "high_memory": {
    "condition": "memory_usage > 95",
    "actions": [
      "echo 'Memory critical - restarting memory-intensive services'",
      "systemctl restart myapp",
      "sync && echo 3 > /proc/sys/vm/drop_caches"
    ]
  },
  
  "nginx_down": {
    "condition": "service_status == 'inactive'",
    "actions": [
      "echo 'Restarting nginx...'",
      "systemctl start nginx",
      "sleep 2",
      "systemctl status nginx"
    ]
  },
  
  "ssl_expiring": {
    "condition": "ssl_days_remaining < 7",
    "actions": [
      "certbot renew --quiet",
      "systemctl reload nginx"
    ]
  },
  
  "database_connections_high": {
    "condition": "db_connections > 90",
    "actions": [
      "echo 'Killing idle database connections...'",
      "psql -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '30 minutes';\""
    ]
  }
}
```

### Safe Mode (Dry-Run)

For testing playbooks without actually executing actions:

```json
{
  "disk_space_low": {
    "condition": "disk_usage > 90",
    "dry_run": true,
    "actions": [
      "echo '[DRY RUN] Would delete: find /tmp -type f -mtime +7 -delete'",
      "echo '[DRY RUN] Would clean logs: find /var/log -name '*.log.*' -mtime +30 -delete'"
    ]
  }
}
```

## Environment-Specific Configs

### Development

```json
{
  "cpu_usage": { "warning": 90, "critical": 98 },
  "memory_usage": { "warning": 90, "critical": 98 },
  "disk_usage": { "warning": 85, "critical": 95 }
}
```

### Staging

```json
{
  "cpu_usage": { "warning": 75, "critical": 90 },
  "memory_usage": { "warning": 80, "critical": 90 },
  "disk_usage": { "warning": 75, "critical": 85 }
}
```

### Production

```json
{
  "cpu_usage": { "warning": 60, "critical": 80 },
  "memory_usage": { "warning": 70, "critical": 85 },
  "disk_usage": { "warning": 70, "critical": 80 },
  "high_availability": true,
  "escalation_enabled": true
}
```

## Using Multiple Configs

You can use environment variables to switch configs:

```bash
# Set config path
export OPS_CONFIG_DIR=/path/to/production/configs

# Or use symbolic links
ln -sf config.production.json config/monitoring-sources.json
```

## Validation

To validate your configuration:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('ops-automation/config/alert-thresholds.json')))"
```

## Next Steps

- See [03-integration.md](./03-integration.md) for integrating with external tools
- See [04-custom-agents.md](./04-custom-agents.md) for creating custom agents
