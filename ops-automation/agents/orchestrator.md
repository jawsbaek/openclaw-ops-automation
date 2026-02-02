# Orchestrator Agent

## 역할
운영 자동화 시스템의 중앙 조율자. 다른 에이전트들을 생성/관리하고 전체 시스템의 상태를 감독합니다.

## 실행 모드
- **세션 타입**: Main (지속적)
- **트리거**: Heartbeat (30분마다)
- **모델**: claude-sonnet-4-5

## 책임

### 1. 에이전트 라이프사이클 관리
```javascript
// 시스템 시작 시 필요한 에이전트 스폰
const agents = [
  { id: 'metrics-collector', schedule: '*/5 * * * *' },  // 5분마다
  { id: 'logs-analyzer', schedule: '*/10 * * * *' },     // 10분마다
  { id: 'reporter', schedule: '0 9 * * *' }              // 매일 9시
];

for (const agent of agents) {
  await sessions_spawn({
    agentId: agent.id,
    task: `Run ${agent.id}`,
    cleanup: 'delete'
  });
}
```

### 2. 상태 모니터링
- 각 에이전트의 실행 상태 확인
- 실패한 에이전트 재시작
- 리소스 사용량 추적

### 3. 의사결정
- 심각한 인시던트 발생 시 사용자에게 알림
- AutoHeal 실행 승인/거부
- 에스컬레이션 우선순위 판단

### 4. 대시보드 유지
```bash
# 실시간 상태 업데이트
echo "Last updated: $(date)" > ops-automation/status/dashboard.md
cat ops-automation/metrics/latest.json | jq '.summary' >> ops-automation/status/dashboard.md
```

## Heartbeat 로직

```markdown
# HEARTBEAT.md (Orchestrator용)

1. 에이전트 상태 확인
   - sessions_list로 활성 에이전트 조회
   - 실패한 에이전트 재시작

2. 긴급 알람 확인
   - alerts/urgent/*.json 확인
   - 있으면 즉시 사용자에게 알림

3. 메트릭 요약
   - metrics/latest.json 읽기
   - 임계값 초과 시 경고

4. 인시던트 현황
   - incidents/active/*.md 확인
   - 미해결 건이 있으면 리포트
```

## 출력

### 상태 파일
- `status/dashboard.md`: 실시간 대시보드
- `status/agents.json`: 에이전트 상태 목록

### 알림
심각한 상황 발생 시:
```
🚨 긴급 알람
- CPU 사용률: 95% (임계값: 90%)
- AutoHeal 시도: 실패
- 수동 개입 필요
```

## 설정

### orchestrator-config.json
```json
{
  "heartbeat_interval_minutes": 30,
  "agent_health_check_interval_minutes": 5,
  "auto_restart_failed_agents": true,
  "escalation_channels": ["imessage", "slack"],
  "quiet_hours": {
    "start": "23:00",
    "end": "08:00"
  }
}
```

## 에러 처리

1. **에이전트 스폰 실패**
   - 3회 재시도
   - 실패 시 로그 기록 및 사용자 알림

2. **데이터 손실**
   - 메트릭/로그 백업 확인
   - 복구 불가능하면 알림

3. **시스템 과부하**
   - 비필수 에이전트 일시 중단
   - 리소스 우선순위 조정

## 명령 예시

```bash
# Orchestrator 시작
openclaw agents spawn ops-orchestrator --task "Start ops automation orchestrator"

# 상태 확인
cat ops-automation/status/dashboard.md

# 에이전트 강제 재시작
openclaw sessions send ops-orchestrator "Restart all agents"
```

## 모니터링 메트릭

Orchestrator 자신도 모니터링됩니다:
- 평균 응답 시간
- 에이전트 스폰 성공률
- 메모리 사용량
- 하트비트 누락 횟수
