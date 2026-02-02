# Alert Handler Agent

## 역할
알람을 수신하고 우선순위를 판단하여 적절한 조치를 취합니다.

## 실행 모드
- **세션 타입**: Isolated (이벤트 기반)
- **트리거**: Metrics Collector 또는 외부 시스템에서 호출
- **모델**: claude-sonnet-4-5

## 입력

### 내부 알람 (Metrics Collector)
```json
{
  "source": "metrics-collector",
  "timestamp": "2026-02-02T11:22:00+09:00",
  "alerts": [
    {
      "severity": "critical",
      "metric": "cpu_percent",
      "value": 95.2,
      "threshold": 90,
      "message": "CPU usage critical"
    }
  ]
}
```

### 외부 알람 (Prometheus Alertmanager)
```json
{
  "source": "prometheus",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighCPU",
        "instance": "macbook-pro",
        "severity": "warning"
      },
      "annotations": {
        "summary": "CPU usage above 70%"
      }
    }
  ]
}
```

## 알람 처리 플로우

```javascript
async function handleAlerts(input) {
  const alerts = normalizeAlerts(input);
  
  for (const alert of alerts) {
    // 1. 중복 필터링
    if (isDuplicate(alert)) {
      console.log(`Skipping duplicate alert: ${alert.metric}`);
      continue;
    }
    
    // 2. 심각도 분류
    const severity = classifySeverity(alert);
    
    // 3. 조치 결정
    switch (severity) {
      case 'critical':
        await handleCriticalAlert(alert);
        break;
      case 'warning':
        await handleWarningAlert(alert);
        break;
      case 'info':
        await logAlert(alert);
        break;
    }
  }
}
```

## 심각도 분류

```javascript
function classifySeverity(alert) {
  // 1. 명시적 심각도가 있으면 사용
  if (alert.severity) {
    return alert.severity;
  }
  
  // 2. 메트릭 기반 분류
  const thresholds = JSON.parse(readFile('config/alert-thresholds.json'));
  const threshold = thresholds[alert.metric];
  
  if (!threshold) {
    return 'info';
  }
  
  if (alert.value >= threshold.critical) {
    return 'critical';
  } else if (alert.value >= threshold.warning) {
    return 'warning';
  } else {
    return 'info';
  }
}
```

## Critical 알람 처리

```javascript
async function handleCriticalAlert(alert) {
  // 1. 인시던트 생성
  const incident = createIncident(alert);
  
  // 2. AutoHeal 시도
  if (canAutoHeal(alert)) {
    const result = await sessions_spawn({
      agentId: 'autoheal',
      task: `Heal incident: ${JSON.stringify(incident)}`
    });
    
    if (result.status === 'resolved') {
      // 복구 성공 - 사용자에게 알림만
      await notifyUser(`✅ AutoHeal 성공: ${alert.message}`);
      return;
    }
  }
  
  // 3. 복구 실패 또는 AutoHeal 불가 - 에스컬레이션
  await escalate(incident);
}
```

## Warning 알람 처리

```javascript
async function handleWarningAlert(alert) {
  // 1. 로그 기록
  await logAlert(alert);
  
  // 2. 지속 시간 확인
  const duration = getAlertDuration(alert);
  
  if (duration > 300) { // 5분 이상 지속
    // Critical로 승격
    alert.severity = 'critical';
    await handleCriticalAlert(alert);
  } else {
    // 모니터링만 계속
    console.log(`Warning alert active for ${duration}s: ${alert.message}`);
  }
}
```

## 중복 필터링

```javascript
// alerts/dedup.json에 최근 알람 기록
function isDuplicate(alert) {
  const dedupState = JSON.parse(readFile('alerts/dedup.json') || '{}');
  const key = `${alert.metric}_${alert.severity}`;
  
  const lastSeen = dedupState[key];
  const now = Date.now();
  
  // 5분 이내에 같은 알람이 있었으면 중복
  if (lastSeen && (now - lastSeen) < 300000) {
    return true;
  }
  
  // 상태 업데이트
  dedupState[key] = now;
  writeFile('alerts/dedup.json', JSON.stringify(dedupState));
  
  return false;
}
```

## 에스컬레이션

```javascript
async function escalate(incident) {
  const config = JSON.parse(readFile('config/escalation-policy.json'));
  
  // 1. 시간대 확인
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 23 || hour < 8) {
    // 야간 - 긴급한 것만
    if (incident.severity !== 'critical') {
      console.log('Non-critical incident during quiet hours - delayed');
      return;
    }
  }
  
  // 2. 담당자 결정
  const oncall = getCurrentOncall(config);
  
  // 3. 알림 전송
  await notifyUser(`
🚨 인시던트 에스컬레이션

**심각도**: ${incident.severity}
**메트릭**: ${incident.metric}
**현재값**: ${incident.value}
**임계값**: ${incident.threshold}

**조치**: ${incident.auto_heal_attempted ? 'AutoHeal 시도했으나 실패' : '수동 개입 필요'}

상세: incidents/${incident.id}.md
  `);
  
  // 4. PagerDuty/Opsgenie 통합
  if (config.pagerduty_enabled) {
    await triggerPagerDuty(incident, oncall);
  }
}
```

## 알람 그룹화

여러 관련 알람을 그룹화:
```javascript
function groupAlerts(alerts) {
  const groups = {
    'system_overload': [],
    'service_down': [],
    'network_issue': [],
    'other': []
  };
  
  for (const alert of alerts) {
    if (alert.metric.includes('cpu') || alert.metric.includes('memory')) {
      groups.system_overload.push(alert);
    } else if (alert.metric.includes('process')) {
      groups.service_down.push(alert);
    } else if (alert.metric.includes('network')) {
      groups.network_issue.push(alert);
    } else {
      groups.other.push(alert);
    }
  }
  
  return groups;
}
```

## 설정

### escalation-policy.json
```json
{
  "pagerduty_enabled": false,
  "quiet_hours": {
    "start": "23:00",
    "end": "08:00"
  },
  "oncall_schedule": [
    {
      "day": "weekday",
      "contact": "imessage:+821062515961"
    },
    {
      "day": "weekend",
      "contact": "email:oncall@example.com"
    }
  ],
  "dedup_window_seconds": 300,
  "auto_heal_enabled": true
}
```

## 외부 통합

### Webhook 수신
```bash
# Express 서버로 외부 알람 수신
curl -X POST http://localhost:18789/alerts/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "datadog",
    "alert": {
      "title": "High Memory Usage",
      "severity": "warning",
      "value": 85
    }
  }'
```

### Alertmanager 통합
```yaml
# alertmanager.yml
receivers:
  - name: 'openclaw'
    webhook_configs:
      - url: 'http://localhost:18789/alerts/webhook'
        send_resolved: true
```

## 통계 추적

```javascript
// alerts/stats.json
{
  "total_alerts": 124,
  "by_severity": {
    "critical": 12,
    "warning": 56,
    "info": 56
  },
  "by_metric": {
    "cpu_percent": 45,
    "disk_usage": 32,
    "api_latency": 28,
    "process_down": 19
  },
  "auto_heal_success_rate": 0.917,
  "average_resolution_time_seconds": 150
}
```

## 테스트

```bash
# 테스트 알람 전송
openclaw agents spawn alert-handler --task '{
  "source": "test",
  "alerts": [{
    "severity": "warning",
    "metric": "cpu_percent",
    "value": 75,
    "threshold": 70,
    "message": "Test alert"
  }]
}'
```
