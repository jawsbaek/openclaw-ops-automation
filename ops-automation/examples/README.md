# 시나리오 예제

실제 운영 환경에서 발생할 수 있는 문제를 자동으로 해결하는 예제 시나리오입니다.

## 시나리오 목록

### 1. 메모리 누수 자동 해결
**파일:** `scenario-memory-leak.js`

**문제:**
- 메모리 사용률 지속적으로 증가 (85% 이상)
- 캐시가 무제한으로 커짐 (unbounded cache)

**해결:**
1. 프로세스 프로파일링으로 원인 파악
2. LRU 캐시로 자동 교체 패치 생성
3. 카나리 배포로 단계적 적용
4. 메트릭 모니터링 및 검증

**실행:**
```bash
node examples/scenario-memory-leak.js
```

---

### 2. 데이터베이스 커넥션 고갈
**파일:** `scenario-db-connection-leak.js`

**문제:**
- DB 커넥션 풀 고갈 (500/500 사용)
- API 응답 시간 5초 이상
- `connection.close()` 누락

**해결:**
1. 로그 분석으로 커넥션 누수 확인
2. try-finally 블록 자동 추가
3. 테스트 환경 배포 후 검증
4. Pull Request 자동 생성

**실행:**
```bash
node examples/scenario-db-connection-leak.js
```

---

### 3. 디스크 파티션 확장 및 정리
**파일:** `scenario-disk-space.js`

**문제:**
- 디스크 사용률 90% 이상
- 오래된 로그 파일 누적
- 로그 로테이션 미설정

**해결:**
1. 큰 파일/디렉토리 분석
2. 로그 로테이션 자동 설정
3. 오래된 로그 S3 아카이빙
4. Cron 작업으로 자동화

**실행:**
```bash
node examples/scenario-disk-space.js
```

---

## 시나리오 실행 방법

### 사전 준비

1. **SSH 키 설정**
```bash
# SSH 키 생성
ssh-keygen -t rsa -b 4096 -f /tmp/test-ssh-key

# 테스트 서버에 키 복사
ssh-copy-id -i /tmp/test-ssh-key.pub user@test-server
```

2. **설정 파일 수정**
```bash
# config/servers.json 편집
# - 실제 서버 주소로 변경
# - SSH 키 경로 설정
```

3. **의존성 설치**
```bash
cd ops-automation
npm install
```

### 개별 시나리오 실행

```bash
# 메모리 누수 시나리오
node examples/scenario-memory-leak.js

# DB 커넥션 시나리오
node examples/scenario-db-connection-leak.js

# 디스크 공간 시나리오
node examples/scenario-disk-space.js
```

### 모든 시나리오 실행

```bash
# 순차 실행
for scenario in examples/scenario-*.js; do
  echo "=== Running $scenario ==="
  node "$scenario"
  echo
done
```

---

## 시나리오 커스터마이징

### 새 시나리오 추가

1. **파일 생성**
```bash
touch examples/scenario-custom.js
```

2. **템플릿 사용**
```javascript
const RemoteExecutor = require('../src/ssh/remote-executor');
const Profiler = require('../src/diagnostic/profiler');

async function customScenario() {
  console.log('=== 커스텀 시나리오 ===\n');
  
  // 1. 문제 감지
  // 2. 진단
  // 3. 해결
  // 4. 검증
  
  console.log('시나리오 완료');
}

if (require.main === module) {
  customScenario()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('오류:', err);
      process.exit(1);
    });
}

module.exports = customScenario;
```

3. **실행**
```bash
node examples/scenario-custom.js
```

---

## Dry-run 모드

실제 변경 없이 시뮬레이션만 실행:

```javascript
const result = await deployManager.deployHotfix({
  patch,
  repository,
  strategy: 'canary',
  dryRun: true  // ← 시뮬레이션 모드
});
```

---

## 문제 해결

### SSH 연결 실패
```bash
# 연결 테스트
ssh -i /path/to/key user@server

# 권한 확인
chmod 600 /path/to/key
```

### 명령 실행 거부
- `config/ssh-whitelist.json`에 명령 추가
- 또는 `requireApproval: true` 설정

### 타임아웃
- `config/diagnostic-playbooks.json`에서 타임아웃 증가
- 또는 명령을 더 빠른 것으로 변경

---

## 참고 자료

- [인프라 액션 가이드](../docs/infra-action-guide.md)
- [SSH Agent 명세](../agents/ssh-agent.md)
- [Diagnostic Agent 명세](../agents/diagnostic-agent.md)
- [Code Healer 명세](../agents/code-healer.md)

---

## 라이선스

MIT License
