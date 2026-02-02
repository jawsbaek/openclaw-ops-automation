# Metrics Collector Agent

## 역할
시스템 메트릭을 주기적으로 수집하고 저장합니다.

## 실행 모드
- **세션 타입**: Isolated (단발성)
- **트리거**: Cron (5분마다)
- **모델**: claude-sonnet-4-5

## 수집 메트릭

### 시스템 리소스
```bash
# CPU 사용률
top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//'

# 메모리 사용률
vm_stat | perl -ne '/page size of (\d+)/ and $size=$1; /Pages active:\s+(\d+)/ and printf("%.2f\n", $1 * $size / 1073741824);'

# 디스크 사용률
df -h | grep '/System/Volumes/Data' | awk '{print $5}' | sed 's/%//'

# 네트워크 I/O
netstat -ib | awk 'NR>1 {sum+=$7} END {print sum}'
```

### 프로세스 상태
```bash
# OpenClaw 게이트웨이 상태
openclaw gateway status | grep "Runtime:" | awk '{print $2}'

# 주요 프로세스 체크
ps aux | grep -E '(nginx|node|postgres)' | grep -v grep
```

### API 헬스체크
```bash
# config/monitoring-sources.json에서 읽어온 엔드포인트 체크
curl -s -o /dev/null -w "%{http_code},%{time_total}" http://localhost:8080/health
```

### Prometheus 쿼리 (옵션)
```bash
# Prometheus가 설정되어 있으면
curl -s 'http://localhost:9090/api/v1/query?query=up' | jq '.data.result'
```

## 출력 형식

### metrics/YYYY-MM-DD-HHmm.json
```json
{
  "timestamp": "2026-02-02T11:22:00+09:00",
  "system": {
    "cpu_percent": 45.2,
    "memory_gb_used": 12.5,
    "memory_gb_total": 16.0,
    "disk_percent": 68.3,
    "network_bytes_in": 1048576,
    "network_bytes_out": 524288
  },
  "processes": {
    "openclaw_gateway": "running",
    "nginx": "running",
    "postgres": "stopped"
  },
  "healthchecks": [
    {
      "name": "API",
      "url": "http://localhost:8080/health",
      "status_code": 200,
      "response_time_ms": 45
    }
  ],
  "alerts": [
    {
      "severity": "warning",
      "metric": "cpu_percent",
      "value": 45.2,
      "threshold": 70,
      "message": "CPU usage is elevated"
    }
  ]
}
```

### metrics/latest.json
최신 메트릭의 심볼릭 링크 또는 복사본

## 로직

```javascript
async function collectMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    system: await collectSystemMetrics(),
    processes: await checkProcesses(),
    healthchecks: await runHealthchecks()
  };

  // 임계값 확인
  const alerts = checkThresholds(metrics);
  metrics.alerts = alerts;

  // 저장
  const filename = `metrics/${formatDate()}.json`;
  await write(filename, JSON.stringify(metrics, null, 2));
  await write('metrics/latest.json', JSON.stringify(metrics, null, 2));

  // 긴급 알람이 있으면 Alert Handler에게 전달
  if (alerts.some(a => a.severity === 'critical')) {
    await sessions_spawn({
      agentId: 'alert-handler',
      task: `Handle critical alerts: ${JSON.stringify(alerts)}`
    });
  }

  return metrics;
}
```

## 임계값 체크

`config/alert-thresholds.json` 참조:
```javascript
function checkThresholds(metrics) {
  const thresholds = JSON.parse(readFile('config/alert-thresholds.json'));
  const alerts = [];

  if (metrics.system.cpu_percent > thresholds.cpu_usage.critical) {
    alerts.push({
      severity: 'critical',
      metric: 'cpu_percent',
      value: metrics.system.cpu_percent,
      threshold: thresholds.cpu_usage.critical,
      message: `CPU usage critical: ${metrics.system.cpu_percent}%`
    });
  }

  // 메모리, 디스크 등도 동일하게 체크
  return alerts;
}
```

## 데이터 보존 정책

```bash
# 메트릭은 30일간 보존
find metrics/ -name '*.json' -mtime +30 -delete

# 집계 데이터는 1년간 보존
# metrics/aggregated/YYYY-MM.json
```

## 성능 최적화

1. **병렬 수집**: 여러 메트릭을 동시에 수집
2. **캐싱**: 변경이 적은 데이터는 캐싱 (1분)
3. **샘플링**: 고빈도 메트릭은 샘플링하여 저장

## 에러 처리

```javascript
try {
  const cpuUsage = await getCpuUsage();
} catch (error) {
  console.error('Failed to get CPU usage:', error);
  // 이전 값 사용 또는 null
  cpuUsage = previousMetrics?.system?.cpu_percent || null;
}
```

## 통합

### Prometheus Exporter
메트릭을 Prometheus 형식으로도 노출:
```bash
# metrics/prometheus.txt
# TYPE cpu_usage gauge
cpu_usage{host="macbook-pro"} 45.2
# TYPE memory_usage gauge
memory_usage{host="macbook-pro"} 12.5
```

### Grafana 대시보드
JSON 파일을 Grafana가 읽을 수 있도록:
```bash
curl -X POST http://localhost:3000/api/datasources/proxy/1/write \
  -d @metrics/latest.json
```
