# OpenClaw Ops Automation - 개발 진단 및 개선 명세서

## 개요

OpenClaw Ops Automation 프로젝트의 종합 진단 결과, **31개의 개선 필요 포인트**가 발견되었습니다.

| 우선순위 | 개수 | 설명 |
|---------|------|------|
| CRITICAL | 4 | 즉시 수정 필요 (런타임 오류, 보안) |
| HIGH | 14 | 프로덕션 전 필수 수정 |
| MEDIUM | 13 | 안정성 향상을 위한 수정 |

---

## CRITICAL 이슈 (4개)

### 1. CommonJS/ES Module 불일치
- **파일**: `src/code-healer/deploy-manager.js`, `patch-generator.js`, `rollback.js`
- **문제**: `require()` 사용하지만 package.json은 `"type": "module"`
- **영향**: 런타임 오류 발생

### 2. AutoHeal 테스트 커버리지 0%
- **파일**: `agents/autoheal.js`
- **문제**: 쉘 명령 실행하는 보안 민감 코드가 테스트 없음
- **영향**: 보안 취약점 및 버그 가능성

### 3. 메모리 수집 하드코딩
- **파일**: `agents/metrics-collector.js:35-48`
- **문제**: `{ total: 16000, used: 8000, percentage: 50 }` 하드코딩
- **영향**: 실제 메모리 모니터링 불가

### 4. 입력 검증 없음
- **파일**: `agents/autoheal.js:21-92`
- **문제**: 외부 입력(webhooks, CLI args) 검증 없이 처리
- **영향**: 명령 인젝션 취약점

---

## HIGH 이슈 (14개)

### 테스트 커버리지 부족

| 파일 | 현재 | 목표 |
|------|------|------|
| `orchestrator.js` | 0% | 80% |
| `logs-analyzer.js` | 0% | 80% |
| `reporter.js` | 0% | 80% |
| `autoheal.js` | 0% | 80% |
| `remote-executor.js` | 39.6% | 80% |

### 플랫폼 호환성
- macOS 전용 명령어 (`top -l 1`, `vm_stat`)
- Linux 전용 명령어 (`top -bn2`, `ps aux --sort`)
- 플랫폼 감지 없음

### 미구현 기능
- `profiler.js:427` - `compareProfiles()` placeholder
- `profiler.js` - `generateRecommendations()` 미구현
- Orchestrator 자체 헬스체크 없음

### 데이터 관리
- 데이터 보존/정리 정책 없음 (metrics/, analysis/, reports/ 무한 축적)

---

## MEDIUM 이슈 (13개)

1. 타임아웃 설정 분산 (5곳에 하드코딩)
2. 의존성 불가용시 graceful degradation 없음
3. 비동기 에러 바운더리 없음
4. Correlation ID 없는 로깅
5. 동시 AutoHeal 경합 상태 위험

---

## 개발 계획

### Priority 1: ES Module 통일 및 보안 수정 (CRITICAL)

| 작업 | 파일 | 예상 시간 |
|------|------|----------|
| code-healer ES module 변환 | `deploy-manager.js`, `patch-generator.js`, `rollback.js` | 2-3시간 |
| remote-executor inline require 수정 | `remote-executor.js:245` | 30분 |
| autoheal 입력 검증 추가 | `autoheal.js:21-92` | 2-4시간 |
| 실제 메모리 수집 구현 | `metrics-collector.js:35-48` | 2시간 |

### Priority 2: 테스트 커버리지 80% 달성 (HIGH)

| 에이전트 | 테스트 파일 생성 |
|---------|-----------------|
| autoheal | `__tests__/agents/autoheal.test.js` |
| orchestrator | `__tests__/agents/orchestrator.test.js` |
| logs-analyzer | `__tests__/agents/logs-analyzer.test.js` |
| reporter | `__tests__/agents/reporter.test.js` |

### Priority 3: 플랫폼 호환성 (MEDIUM)

| 작업 | 파일 |
|------|------|
| 플랫폼 감지 유틸리티 | 신규: `lib/platform.js` |
| metrics-collector 크로스플랫폼 | `metrics-collector.js` 수정 |
| 설정 중앙화 | 신규: `config/system-defaults.json` |

### Priority 4: 미구현 기능 완성 (LOW)

| 기능 | 파일 |
|------|------|
| compareProfiles() 구현 | `profiler.js:427-433` |
| generateRecommendations() 구현 | `profiler.js` |
| Orchestrator 자체 헬스체크 | `orchestrator.js` |
| AutoHeal 동시성 제어 | `autoheal.js` |

---

## 파일 목록

### 수정 필요 파일
1. `/ops-automation/src/code-healer/deploy-manager.js`
2. `/ops-automation/src/code-healer/patch-generator.js`
3. `/ops-automation/src/code-healer/rollback.js`
4. `/ops-automation/src/ssh/remote-executor.js`
5. `/ops-automation/agents/autoheal.js`
6. `/ops-automation/agents/metrics-collector.js`
7. `/ops-automation/agents/orchestrator.js`
8. `/ops-automation/src/diagnostic/profiler.js`

### 신규 생성 파일
1. `/ops-automation/__tests__/agents/autoheal.test.js`
2. `/ops-automation/__tests__/agents/orchestrator.test.js`
3. `/ops-automation/__tests__/agents/logs-analyzer.test.js`
4. `/ops-automation/__tests__/agents/reporter.test.js`
5. `/ops-automation/lib/platform.js`
6. `/ops-automation/config/system-defaults.json`

---

## 성공 기준

- [ ] 모든 파일이 ES modules로 통일
- [ ] 핵심 에이전트 테스트 커버리지 80% 이상
- [ ] npm run check 통과 (lint + format + test)
- [ ] 플랫폼 감지 및 크로스플랫폼 지원
- [ ] 모든 CRITICAL 이슈 해결
