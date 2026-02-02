# OpenClaw 운영 자동화 시스템

OpenClaw 기반 분산 운영 모니터링 자동화 시스템. 여러 독립적인 AI 에이전트가 협력하여 인프라를 모니터링하고 자동으로 대응합니다.

## 🎯 특징

### 운영 자동화
- **6개 협력 에이전트**: Orchestrator, Metrics Collector, Logs Analyzer, Alert Handler, AutoHeal, Reporter
- **자동 메트릭 수집**: CPU, 메모리, 디스크, 네트워크, 프로세스 상태
- **지능형 로그 분석**: 에러 패턴, 보안 위협, 이상 징후 감지
- **자동 복구**: 디스크 정리, 프로세스 재시작, SSL 갱신 등
- **스마트 알람**: 중복 필터링, 우선순위 판단, 에스컬레이션
- **자동 리포팅**: 일일/주간/월간 운영 보고서

### 🤖 PR 자동 리뷰 & 머지
- **자동 코드 리뷰**: AI 기반 코드 품질, 보안, 성능 분석
- **보안 스캔**: 하드코딩된 시크릿, 명령 인젝션 패턴 감지
- **자동 승인**: 모든 조건 충족 시 자동 승인 및 머지
- **스마트 머지**: Squash/Merge/Rebase 전략 지원
- **실시간 알림**: Slack/Discord 웹훅 통합
- **안전 장치**: 화이트리스트, hold 라벨, 자동 revert

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

### 운영 자동화
자세한 설명은 [`ops-automation/README.md`](ops-automation/README.md)를 참조하세요.

### PR 자동화
PR 자동 리뷰 및 머지 시스템에 대한 자세한 내용은 [`docs/pr-automation-guide.md`](docs/pr-automation-guide.md)를 참조하세요.

**주요 기능:**
- ✅ **코드 품질 검사**: Biome 린팅 & 포맷팅, 테스트, 커버리지 (80% 이상)
- 🔒 **보안 스캔**: npm audit, 시크릿 스캔, 인젝션 패턴 검사
- 🤖 **AI 리뷰**: GPT-4 기반 코드 분석 (8/10 점 이상 자동 승인)
- 🔀 **자동 머지**: 조건부 자동 머지 (squash/merge/rebase)
- 📢 **알림**: Slack/Discord 실시간 알림

**설정 방법:**
```bash
# 1. GitHub Secrets 설정
gh secret set OPENAI_API_KEY --body "sk-..."
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/..."

# 2. 설정 파일 수정
vim .github/auto-review-config.yml

# 3. PR 생성 시 자동으로 리뷰 시작!
```

자세한 가이드: [`docs/pr-automation-guide.md`](docs/pr-automation-guide.md)

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
