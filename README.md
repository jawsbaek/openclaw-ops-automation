# OpenClaw 운영 자동화 시스템

OpenClaw 기반 분산 운영 모니터링 자동화 시스템. 여러 독립적인 AI 에이전트가 협력하여 인프라를 모니터링하고 자동으로 대응합니다.

## 🎯 특징

- **6개 협력 에이전트**: Orchestrator, Metrics Collector, Logs Analyzer, Alert Handler, AutoHeal, Reporter
- **자동 메트릭 수집**: CPU, 메모리, 디스크, 네트워크, 프로세스 상태
- **지능형 로그 분석**: 에러 패턴, 보안 위협, 이상 징후 감지
- **자동 복구**: 디스크 정리, 프로세스 재시작, SSL 갱신 등
- **스마트 알람**: 중복 필터링, 우선순위 판단, 에스컬레이션
- **자동 리포팅**: 일일/주간/월간 운영 보고서

## 🚀 빠른 시작

```bash
# 1. OpenClaw 설치 (필수)
npm install -g openclaw

# 2. 초기 설정
cd ops-automation
./scripts/setup.sh

# 3. Orchestrator 시작
openclaw agents spawn ops-orchestrator
```

## 📚 상세 문서

자세한 설명은 [`ops-automation/README.md`](ops-automation/README.md)를 참조하세요.

## 🔗 통합 가능한 툴

- **메트릭**: Prometheus, Grafana, CloudWatch
- **로그**: ELK Stack, Loki, Fluentd  
- **알람**: Alertmanager, PagerDuty, Opsgenie
- **APM**: Datadog, New Relic, Sentry

## 📋 요구사항

- OpenClaw >= 1.0
- Node.js >= 18
- macOS, Linux 또는 Windows (WSL)

## 📖 에이전트 명세

각 에이전트의 상세 명세는 [`ops-automation/agents/`](ops-automation/agents/) 디렉토리를 참조하세요.

## 🤝 기여

이슈 및 PR 환영합니다!

## 📄 라이선스

MIT
