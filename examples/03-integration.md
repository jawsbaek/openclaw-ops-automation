# Example 3: Integration with Monitoring Tools

This example demonstrates how to integrate OpenClaw Ops Automation with popular monitoring and alerting tools.

## Prometheus Integration

### Setup

1. **Install Prometheus:**
```bash
# macOS
brew install prometheus

# Linux
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*
```

2. **Configure Prometheus:**

Create `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']  # Node Exporter
  
  - job_name: 'myapp'
    static_configs:
      - targets: ['localhost:8080']  # Your application
```

3. **Start Prometheus:**
```bash
./prometheus --config.file=prometheus.yml
```

4. **Update monitoring-sources.json:**
```json
{
  "prometheus": {
    "enabled": true,
    "endpoint": "http://localhost:9090",
    "queries": {
      "cpu": "rate(node_cpu_seconds_total{mode!=\"idle\"}[5m])",
      "memory": "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
      "disk": "1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)",
      "http_requests": "rate(http_requests_total[5m])",
      "http_errors": "rate(http_requests_total{status=~\"5..\"}[5m])"
    }
  }
}
```

## Grafana Dashboards

### Docker Setup

```bash
docker run -d \
  --name=grafana \
  -p 3000:3000 \
  -v grafana-storage:/var/lib/grafana \
  grafana/grafana
```

### Create Dashboard

1. Access Grafana: http://localhost:3000 (admin/admin)
2. Add Prometheus data source
3. Import dashboard JSON:

```json
{
  "dashboard": {
    "title": "OpenClaw Ops Automation",
    "panels": [
      {
        "title": "CPU Usage",
        "targets": [
          {
            "expr": "rate(node_cpu_seconds_total[5m])"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes"
          }
        ]
      },
      {
        "title": "Disk Usage",
        "targets": [
          {
            "expr": "node_filesystem_avail_bytes / node_filesystem_size_bytes"
          }
        ]
      }
    ]
  }
}
```

## Slack Integration

### Webhook Setup

1. Create Slack incoming webhook
2. Add notification function to `alert-handler.js`:

```javascript
import axios from 'axios';

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

async function sendSlackAlert(alert) {
  if (!SLACK_WEBHOOK) return;

  const message = {
    text: `🚨 *${alert.level.toUpperCase()} Alert*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.metric}*: ${alert.message}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Value:*\n${alert.value}`
          },
          {
            type: 'mrkdwn',
            text: `*Threshold:*\n${alert.threshold}`
          }
        ]
      }
    ]
  };

  await axios.post(SLACK_WEBHOOK, message);
}
```

## PagerDuty Integration

### Setup

```bash
npm install @pagerduty/pdjs
```

```javascript
import { api } from '@pagerduty/pdjs';

const pd = api({ token: process.env.PAGERDUTY_TOKEN });

async function createPagerDutyIncident(alert) {
  if (alert.level !== 'critical') return;

  const incident = {
    incident: {
      type: 'incident',
      title: `${alert.metric}: ${alert.message}`,
      service: {
        id: process.env.PAGERDUTY_SERVICE_ID,
        type: 'service_reference'
      },
      urgency: 'high',
      body: {
        type: 'incident_body',
        details: JSON.stringify(alert, null, 2)
      }
    }
  };

  await pd.post('/incidents', { data: incident });
}
```

## ELK Stack Integration

### Logstash Pipeline

Create `logstash-openclaw.conf`:

```ruby
input {
  file {
    path => "/app/logs/*.log"
    start_position => "beginning"
    codec => "json"
  }
}

filter {
  json {
    source => "message"
  }
  
  mutate {
    add_field => { "[@metadata][index]" => "openclaw-ops-%{+YYYY.MM.dd}" }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "%{[@metadata][index]}"
  }
}
```

Run:
```bash
docker run -d \
  --name logstash \
  -v ./logstash-openclaw.conf:/usr/share/logstash/pipeline/logstash.conf \
  -v /app/logs:/app/logs:ro \
  docker.elastic.co/logstash/logstash:8.11.0
```

## Datadog Integration

### Setup

```bash
npm install dd-trace --save
```

```javascript
import tracer from 'dd-trace';

tracer.init({
  service: 'openclaw-ops-automation',
  env: process.env.NODE_ENV || 'development'
});

// In your agents
import { metrics } from 'dd-trace';

// Send custom metrics
metrics.gauge('openclaw.cpu.usage', cpuUsage);
metrics.gauge('openclaw.memory.usage', memoryUsage);
metrics.increment('openclaw.alerts.total');
```

## AWS CloudWatch Integration

```javascript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({ region: 'us-east-1' });

async function sendToCloudWatch(metrics) {
  const params = {
    Namespace: 'OpenClaw/OpsAutomation',
    MetricData: [
      {
        MetricName: 'CPUUsage',
        Value: metrics.system.cpu,
        Unit: 'Percent',
        Timestamp: new Date(metrics.timestamp)
      },
      {
        MetricName: 'MemoryUsage',
        Value: metrics.system.memory.percentage,
        Unit: 'Percent',
        Timestamp: new Date(metrics.timestamp)
      }
    ]
  };

  await cloudwatch.send(new PutMetricDataCommand(params));
}
```

## Discord Notifications

```javascript
import { WebhookClient, EmbedBuilder } from 'discord.js';

const webhookClient = new WebhookClient({
  url: process.env.DISCORD_WEBHOOK_URL
});

async function sendDiscordAlert(alert) {
  const embed = new EmbedBuilder()
    .setColor(alert.level === 'critical' ? 0xFF0000 : 0xFFA500)
    .setTitle(`${alert.level.toUpperCase()} Alert`)
    .setDescription(alert.message)
    .addFields(
      { name: 'Metric', value: alert.metric, inline: true },
      { name: 'Value', value: String(alert.value), inline: true },
      { name: 'Threshold', value: String(alert.threshold), inline: true }
    )
    .setTimestamp();

  await webhookClient.send({ embeds: [embed] });
}
```

## Webhook Integration (Generic)

For any service that accepts webhooks:

```javascript
async function sendWebhook(url, alert) {
  const payload = {
    event: 'alert',
    severity: alert.level,
    metric: alert.metric,
    value: alert.value,
    threshold: alert.threshold,
    message: alert.message,
    timestamp: alert.timestamp,
    metadata: alert.metadata
  };

  await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-OpenClaw-Event': 'alert'
    }
  });
}
```

## Complete Integration Example

Modify `alert-handler.js`:

```javascript
async function handleAlert(alert) {
  logger.info('Handling alert', { id: alert.id });

  const result = {
    alertId: alert.id,
    actions: ['logged'],
    timestamp: new Date().toISOString()
  };

  // Send to all configured integrations
  const integrations = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    integrations.push(sendSlackAlert(alert));
  }

  if (process.env.DISCORD_WEBHOOK_URL) {
    integrations.push(sendDiscordAlert(alert));
  }

  if (process.env.PAGERDUTY_TOKEN && alert.level === 'critical') {
    integrations.push(createPagerDutyIncident(alert));
  }

  if (process.env.DATADOG_ENABLED) {
    integrations.push(sendToDatadog(alert));
  }

  await Promise.allSettled(integrations);
  
  result.actions.push('notified');
  
  // Trigger AutoHeal if applicable
  if (alert.shouldAutoHeal) {
    result.actions.push('autoheal_triggered');
    result.autoHealRequested = true;
  }

  return result;
}
```

## Next Steps

- See [04-custom-agents.md](./04-custom-agents.md) for creating custom agents
- See [05-production-deployment.md](./05-production-deployment.md) for production best practices
