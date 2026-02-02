# 인프라 액션 가이드

## 개요

OpenClaw 운영 자동화 시스템의 인프라 액션 기능은 서버 레벨 및 코드 레벨의 문제를 자동으로 진단하고 해결합니다.

## 주요 기능

### 1. SSH 원격 실행
다중 서버에 SSH로 접속하여 진단 및 복구 명령을 안전하게 실행합니다.

**특징:**
- 연결 풀 관리로 효율적인 리소스 사용
- 명령 화이트리스트로 보안 강화
- 병렬 실행으로 빠른 진단
- 자동 재연결 및 에러 처리

### 2. 자동 진단
문제 유형별 플레이북을 실행하여 근본 원인을 파악합니다.

**진단 플레이북:**
- 메모리 이슈 (누수, 높은 사용률)
- CPU 이슈 (높은 부하, 스파이크)
- 디스크 이슈 (공간 부족, I/O 병목)
- 네트워크 이슈 (연결 실패, 높은 에러율)
- 애플리케이션 이슈 (서비스 다운, 에러 로그)
- 데이터베이스 이슈 (슬로우 쿼리, 커넥션 고갈)

### 3. 코드 자동 수정
진단 결과를 기반으로 코드 패치를 자동 생성하고 배포합니다.

**지원하는 패턴:**
- 리소스 누수 (connection.close() 누락)
- 에러 핸들링 (try-catch 누락)
- 타임아웃 추가 (fetch, axios)
- 메모리 누수 (unbounded cache → LRU cache)

### 4. 안전한 배포
카나리 배포, 블루-그린 배포를 통해 단계적으로 패치를 적용합니다.

**배포 전략:**
- **카나리**: 테스트 → 스테이징 → 프로덕션 10% → 50% → 100%
- **블루-그린**: 새 환경 배포 → 트래픽 점진적 전환 → 이전 환경 종료
- **자동 롤백**: 메트릭 이상 감지 시 즉시 복구

## 설치 및 설정

### 1. SSH 키 설정

```bash
# SSH 키 생성
ssh-keygen -t rsa -b 4096 -f /secure/ssh-keys/ops-bot.pem

# 서버에 공개키 배포
ssh-copy-id -i /secure/ssh-keys/ops-bot.pem.pub ops-bot@server.example.com
```

### 2. 서버 인벤토리 설정

`config/servers.json` 파일을 편집:

```json
{
  "groups": {
    "web": ["web1.example.com", "web2.example.com"],
    "db": ["db-master.example.com"]
  },
  "ssh": {
    "user": "ops-bot",
    "key_path": "/secure/ssh-keys/ops-bot.pem",
    "port": 22
  }
}
```

### 3. 진단 플레이북 커스터마이징

`config/diagnostic-playbooks.json`에서 플레이북 추가/수정:

```json
{
  "playbooks": {
    "custom_check": {
      "name": "커스텀 체크",
      "triggers": ["custom_alert"],
      "steps": [
        {
          "name": "상태 확인",
          "command": "systemctl status my-service",
          "timeout": 5000,
          "parser": "service_status"
        }
      ]
    }
  }
}
```

### 4. 리포지토리 연결

`config/code-repositories.json`에 리포지토리 등록:

```json
{
  "repositories": {
    "my-app": {
      "repo": "git@github.com:company/my-app.git",
      "branch": "main",
      "service": "my-app.service",
      "auto_patch_enabled": true
    }
  }
}
```

## 사용 예제

### 예제 1: 수동 진단 실행

```javascript
const DiagnosticAgent = require('./agents/diagnostic-agent');

const agent = new DiagnosticAgent(sshExecutor);

const diagnosis = await agent.diagnose({
  alertType: 'high_memory',
  target: 'web-servers'
});

console.log('근본 원인:', diagnosis.rootCause);
console.log('권장 조치:', diagnosis.recommendations);
```

### 예제 2: 자동 패치 생성

```javascript
const PatchGenerator = require('./src/code-healer/patch-generator');

const generator = new PatchGenerator(patternsConfig);

const patch = await generator.generatePatch({
  type: 'connection_leak',
  affectedFiles: ['src/db/connection.js'],
  evidence: ['connection.close() not called']
});

console.log('패치 생성 완료:', patch.id);
```

### 예제 3: 카나리 배포

```javascript
const DeployManager = require('./src/code-healer/deploy-manager');

const manager = new DeployManager(sshExecutor, config);

const deployment = await manager.deployHotfix({
  patch,
  repository: 'main-api',
  strategy: 'canary',
  autoRollback: true
});

console.log('배포 상태:', deployment.status);
```

### 예제 4: 수동 롤백

```javascript
const RollbackSystem = require('./src/code-healer/rollback');

const rollback = new RollbackSystem(sshExecutor, deployManager);

await rollback.rollback(deploymentId, '메트릭 이상 감지');

console.log('롤백 완료');
```

## 통합 워크플로우

전체 자동화 플로우:

```
1. Alert Handler가 알람 수신
   ↓
2. Diagnostic Agent가 자동 진단 실행
   ↓
3. 진단 결과 분석
   ↓
4. 해결 전략 선택
   ├─ AutoHeal: 간단한 문제 (서비스 재시작, 캐시 정리)
   ├─ SSH Agent: 서버 레벨 수정 (디스크 정리, 설정 변경)
   └─ Code Healer: 코드 레벨 수정 (패치 생성 및 배포)
   ↓
5. 배포 (카나리/블루-그린)
   ↓
6. 메트릭 모니터링
   ↓
7. 검증 성공? 
   ├─ Yes: 완전 배포
   └─ No: 자동 롤백
   ↓
8. Reporter가 결과 보고
```

## 안전 장치

### 명령 화이트리스트

`config/ssh-whitelist.json`:

```json
{
  "allowedCommands": ["ps", "top", "systemctl status"],
  "requireApproval": ["systemctl restart", "kill"],
  "forbidden": ["rm -rf /", "dd"]
}
```

### 배포 제한

- 한 번에 하나의 파일만 수정
- 최대 50줄 변경
- 테스트 코드 있는 경우만 자동 배포
- 프로덕션은 비즈니스 시간 외 권장

### 자동 롤백 조건

- 에러율 > 1%
- 응답 시간 > 500ms (20% 증가)
- 헬스 체크 3회 연속 실패
- CPU/메모리 급증 (> 85%)

## 모니터링 및 로깅

### 실행 이력 조회

```javascript
const history = sshExecutor.executionHistory.slice(-10);
console.log('최근 10개 명령:', history);
```

### 배포 상태 조회

```javascript
const status = deployManager.getStatus();
console.log('활성 배포:', status.activeDeployments);
console.log('최근 배포:', status.recentDeployments);
```

### 롤백 통계

```javascript
const stats = rollbackSystem.getStatistics();
console.log('롤백 성공률:', stats.successRate);
```

## 문제 해결

### SSH 연결 실패

```bash
# 키 권한 확인
chmod 600 /secure/ssh-keys/ops-bot.pem

# 연결 테스트
ssh -i /secure/ssh-keys/ops-bot.pem ops-bot@server.example.com

# 방화벽 확인
telnet server.example.com 22
```

### 진단 타임아웃

플레이북 타임아웃 증가:

```json
{
  "steps": [
    {
      "name": "오래 걸리는 작업",
      "command": "du -sh /*",
      "timeout": 60000
    }
  ]
}
```

### 배포 실패

1. 로그 확인: `deployment.stages[].error`
2. 수동 롤백: `rollback.rollback(deploymentId, 'manual')`
3. 헬스 체크 확인: `curl http://server/health`

## 베스트 프랙티스

1. **작게 시작**: 간단한 진단부터 시작, 점진적으로 자동화 확대
2. **Dry-run 모드**: 실제 실행 전 시뮬레이션으로 검증
3. **승인 워크플로우**: 중요한 액션은 수동 승인
4. **모니터링**: 배포 후 최소 5분 이상 메트릭 관찰
5. **롤백 준비**: 항상 롤백 가능한 상태 유지
6. **문서화**: 모든 자동화 액션 기록
7. **테스트**: 스테이징에서 충분히 테스트 후 프로덕션 적용
8. **점진적 배포**: 카나리 배포로 리스크 최소화

## 로드맵

- [ ] 더 많은 패치 패턴 추가 (메모리 누수, 데드락 등)
- [ ] AI 기반 근본 원인 분석
- [ ] Kubernetes 지원
- [ ] Terraform 통합
- [ ] 메트릭 기반 자동 스케일링
- [ ] ChatOps 통합 (Slack 명령)

## 지원

문제 발생 시:
1. GitHub Issues: https://github.com/jawsbaek/openclaw-ops-automation/issues
2. 문서: `docs/` 폴더
3. 예제: `examples/` 폴더

## 라이선스

MIT License
