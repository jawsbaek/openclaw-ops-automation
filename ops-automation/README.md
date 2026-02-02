# OpenClaw 운영 자동화 AI 에이전트 세트

## 개요
OpenClaw 기반 분산 운영 모니터링 자동화 시스템. 여러 독립적인 AI 에이전트가 협력하여 인프라를 모니터링하고 자동으로 대응합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│         Orchestrator Agent (오케스트레이터)              │
│         - 전체 조율 및 의사결정                           │
└─────────────────┬───────────────────────────────────────┘
                  │
        ┌─────────┼─────────┬─────────┬─────────┐
        │         │         │         │         │
   ┌────▼───┐┌───▼────┐┌──▼─────┐┌──▼─────┐┌──▼──────┐
   │Metrics ││ Logs   ││ Alert  ││AutoHeal││Reporter │
   │Collector││Analyzer││Handler ││Agent   ││Agent    │
   └────────┘└────────┘└────────┘└────────┘└─────────┘
```

## 에이전트 구성

### 1. Orchestrator Agent (메인)
- **역할**: 전체 시스템 조율, 에이전트 스폰 및 관리
- **주기**: 상시 대기 (heartbeat 기반)
- **책임**:
  - 다른 에이전트 생성/관리
  - 크리티컬 의사결정
  - 사용자 인터페이스

### 2. Metrics Collector Agent
- **역할**: 시스템 메트릭 수집
- **주기**: 5분마다 (cron)
- **수집 대상**:
  - CPU, Memory, Disk 사용률
  - 네트워크 트래픽
  - 프로세스 상태
  - API 응답 시간
- **출력**: `metrics/YYYY-MM-DD-HHmm.json`

### 3. Logs Analyzer Agent
- **역할**: 로그 분석 및 이상 패턴 감지
- **주기**: 10분마다 (cron)
- **분석 대상**:
  - 에러 로그 패턴
  - 비정상 접근 시도
  - 성능 저하 징후
- **출력**: `analysis/log-insights-YYYY-MM-DD.md`

### 4. Alert Handler Agent
- **역할**: 알람 수신 및 우선순위 판단
- **주기**: 이벤트 기반 (webhook)
- **처리**:
  - 알람 심각도 분류
  - 중복 알람 필터링
  - 담당자 에스컬레이션
  - AutoHeal Agent 호출

### 5. AutoHeal Agent
- **역할**: 일반적인 문제 자동 복구
- **주기**: 요청 시 (Alert Handler가 호출)
- **복구 시나리오**:
  - 디스크 공간 부족 → 로그 정리
  - 프로세스 다운 → 재시작
  - 메모리 누수 → 프로세스 재시작
  - SSL 인증서 만료 임박 → 갱신
- **출력**: `incidents/YYYY-MM-DD-{incident_id}.md`

### 6. Reporter Agent
- **역할**: 주기적 상태 보고서 생성
- **주기**: 일일/주간 (cron)
- **보고서**:
  - 일일 시스템 헬스 리포트
  - 주간 인시던트 요약
  - 월간 트렌드 분석
- **출력**: `reports/ops-report-YYYY-MM-DD.md`

## 설정

### 모니터링 소스 설정
`config/monitoring-sources.json`:
```json
{
  "prometheus": {
    "enabled": true,
    "endpoint": "http://localhost:9090",
    "queries": {
      "cpu": "rate(node_cpu_seconds_total[5m])",
      "memory": "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes",
      "disk": "node_filesystem_avail_bytes / node_filesystem_size_bytes"
    }
  },
  "logs": {
    "paths": [
      "/var/log/system.log",
      "/tmp/openclaw/*.log",
      "/var/log/nginx/*.log"
    ]
  },
  "healthchecks": [
    {"name": "API", "url": "http://localhost:8080/health", "interval": 60},
    {"name": "Database", "url": "http://localhost:5432/health", "interval": 120}
  ]
}
```

### 알람 임계값 설정
`config/alert-thresholds.json`:
```json
{
  "cpu_usage": {"warning": 70, "critical": 90},
  "memory_usage": {"warning": 80, "critical": 95},
  "disk_usage": {"warning": 75, "critical": 90},
  "api_latency_ms": {"warning": 500, "critical": 2000},
  "error_rate_per_min": {"warning": 10, "critical": 50}
}
```

### AutoHeal 시나리오
`config/autoheal-playbooks.json`:
```json
{
  "disk_space_low": {
    "condition": "disk_usage > 90",
    "actions": [
      "find /tmp -type f -mtime +7 -delete",
      "find /var/log -name '*.log.*' -mtime +30 -delete",
      "docker system prune -f"
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

## 사용법

### 초기 설정
```bash
cd /Users/User/.openclaw/workspace/ops-automation
./scripts/setup.sh
```

### 에이전트 시작
```bash
# Orchestrator (메인 에이전트)가 다른 에이전트들을 자동으로 스폰합니다
openclaw agents spawn ops-orchestrator
```

### 수동 에이전트 실행
```bash
# 메트릭 수집
openclaw agents spawn metrics-collector --task "Collect current system metrics"

# 로그 분석
openclaw agents spawn logs-analyzer --task "Analyze logs from the last hour"

# 보고서 생성
openclaw agents spawn reporter --task "Generate daily ops report"
```

## 디렉토리 구조

```
ops-automation/
├── README.md                    # 이 문서
├── agents/
│   ├── orchestrator.md         # Orchestrator 에이전트 명세
│   ├── metrics-collector.md    # Metrics Collector 명세
│   ├── logs-analyzer.md        # Logs Analyzer 명세
│   ├── alert-handler.md        # Alert Handler 명세
│   ├── autoheal.md             # AutoHeal 명세
│   └── reporter.md             # Reporter 명세
├── config/
│   ├── monitoring-sources.json
│   ├── alert-thresholds.json
│   └── autoheal-playbooks.json
├── scripts/
│   ├── setup.sh                # 초기 설정 스크립트
│   ├── deploy-agents.sh        # 에이전트 배포
│   └── test-autoheal.sh        # AutoHeal 테스트
├── metrics/                     # 수집된 메트릭 (시계열 데이터)
├── analysis/                    # 로그 분석 결과
├── incidents/                   # 인시던트 기록
└── reports/                     # 생성된 보고서
```

## 통합 가능한 모니터링 툴

### 메트릭 수집
- **Prometheus**: 시계열 메트릭 DB
- **Grafana**: 시각화 대시보드
- **Node Exporter**: 시스템 메트릭
- **CloudWatch**: AWS 모니터링

### 로그 관리
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Loki**: 경량 로그 집계
- **Fluentd**: 로그 수집기

### 알람
- **Alertmanager** (Prometheus)
- **PagerDuty**: 온콜 관리
- **Opsgenie**: 인시던트 관리

### APM (Application Performance Monitoring)
- **Datadog**: 통합 모니터링
- **New Relic**: APM
- **Sentry**: 에러 트래킹

## 확장 아이디어

1. **예측적 스케일링**: 메트릭 트렌드 기반 리소스 자동 조정
2. **비용 최적화 에이전트**: 클라우드 리소스 사용 패턴 분석 및 최적화 제안
3. **보안 모니터링**: 침입 탐지 및 취약점 스캔
4. **SLO 추적**: Service Level Objective 달성도 모니터링
5. **ChatOps 통합**: Slack/Discord로 운영 명령 실행

## 보안 고려사항

- 에이전트 간 통신은 OpenClaw 내부 세션으로 격리
- AutoHeal은 화이트리스트 기반 명령만 실행
- 민감한 메트릭/로그는 암호화 저장
- 알람은 역할 기반 접근 제어 (RBAC)

## 라이선스
MIT

## 기여
이슈 및 PR 환영합니다.
