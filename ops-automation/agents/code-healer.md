# Code Healer Agent

## 역할
코드 레벨의 문제를 자동으로 감지하고 패치를 생성하여 배포하는 에이전트

## 책임

### 1. 코드 분석
- **리포지토리 연결**: Git 리포지토리 클론 및 동기화
- **정적 분석**: 일반적인 버그 패턴 검색
- **의존성 체크**: 라이브러리 버전 및 보안 취약점
- **코드 스멜**: 잠재적 문제 코드 식별

### 2. 자동 패치 생성
- **패턴 기반 수정**: 알려진 버그 패턴 자동 수정
- **리소스 누수**: 커넥션, 파일 핸들 미정리 수정
- **에러 핸들링**: 누락된 try-catch 추가
- **타입 안전성**: 타입 검증 코드 추가

### 3. 배포 관리
- **핫픽스 빌드**: 긴급 패치 자동 빌드
- **카나리 배포**: 단계적 배포
- **헬스 체크**: 배포 후 서비스 상태 확인
- **자동 롤백**: 문제 발생 시 이전 버전으로 복귀

### 4. 변경 추적
- **Git 커밋**: 모든 변경사항 기록
- **PR 생성**: 자동 수정 내역 Pull Request
- **변경 로그**: 상세한 변경 이력 관리
- **감사 추적**: 누가, 언제, 왜 변경했는지 기록

## 입력
```javascript
{
  "diagnosisId": "diag-67890",
  "issue": {
    "type": "memory_leak",
    "component": "database_connection",
    "evidence": ["connection.close() not called in error path"],
    "affectedFiles": ["src/db/connection-manager.js"]
  },
  "strategy": "auto_patch",
  "deploymentPlan": {
    "mode": "canary",
    "stages": ["test", "staging", "production"],
    "rolloutPercentage": [10, 50, 100]
  }
}
```

## 출력
```javascript
{
  "healingId": "heal-24680",
  "success": true,
  "patch": {
    "files": ["src/db/connection-manager.js"],
    "changes": [
      {
        "file": "src/db/connection-manager.js",
        "line": 42,
        "type": "add",
        "code": "  } finally {\n    connection.close();\n  }"
      }
    ],
    "commitHash": "a1b2c3d4",
    "prUrl": "https://github.com/company/repo/pull/123"
  },
  "deployment": {
    "status": "completed",
    "stages": [
      {
        "environment": "test",
        "status": "success",
        "deployedAt": "2026-02-02T03:00:00Z",
        "healthCheck": "passed"
      },
      {
        "environment": "staging",
        "status": "success",
        "deployedAt": "2026-02-02T03:15:00Z",
        "healthCheck": "passed"
      },
      {
        "environment": "production",
        "status": "success",
        "deployedAt": "2026-02-02T03:30:00Z",
        "healthCheck": "passed"
      }
    ]
  },
  "validation": {
    "issueResolved": true,
    "metricsImproved": {
      "memory_usage": { "before": 92, "after": 68 }
    }
  }
}
```

## 지원하는 자동 수정 패턴

### 리소스 누수
```javascript
// Before
async function query(sql) {
  const conn = await pool.getConnection();
  const result = await conn.query(sql);
  return result; // ❌ connection not released
}

// After
async function query(sql) {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(sql);
    return result;
  } finally {
    conn.release(); // ✅ always released
  }
}
```

### 에러 핸들링
```javascript
// Before
async function fetchData() {
  const response = await fetch(url); // ❌ no error handling
  return response.json();
}

// After
async function fetchData() {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    logger.error('Failed to fetch data', error);
    throw error;
  }
}
```

### 메모리 누수 (캐시)
```javascript
// Before
const cache = {}; // ❌ unbounded cache
function getCached(key) {
  if (!cache[key]) {
    cache[key] = expensiveComputation(key);
  }
  return cache[key];
}

// After
const LRU = require('lru-cache');
const cache = new LRU({ max: 1000, maxAge: 3600000 }); // ✅ bounded cache
function getCached(key) {
  if (!cache.has(key)) {
    cache.set(key, expensiveComputation(key));
  }
  return cache.get(key);
}
```

### 타임아웃 누락
```javascript
// Before
await fetch(url); // ❌ no timeout

// After
await fetch(url, { 
  signal: AbortSignal.timeout(5000) // ✅ 5s timeout
});
```

## 배포 전략

### 카나리 배포
1. 테스트 환경 (자동)
2. 스테이징 (자동)
3. 프로덕션 10% (자동)
4. 프로덕션 50% (승인 또는 자동)
5. 프로덕션 100% (승인 또는 자동)

각 단계마다 헬스 체크 및 메트릭 모니터링

### 블루-그린 배포
1. 새 버전을 별도 환경에 배포
2. 트래픽 일부를 새 버전으로 라우팅
3. 문제 없으면 전체 트래픽 전환
4. 이전 버전 대기 상태 유지 (롤백용)

## 안전 장치

### 자동 실행 제한
- **간단한 수정만 자동**: 리소스 정리, 로깅 추가 등
- **복잡한 수정은 PR**: 로직 변경, 알고리즘 수정 등
- **위험한 수정은 승인 필수**: DB 마이그레이션, 설정 변경 등

### 롤백 조건
- 에러율 증가 (> 1%)
- 응답 시간 증가 (> 20%)
- 헬스 체크 실패
- 메모리/CPU 급증

### 변경 범위 제한
- 한 번에 하나의 파일만 수정
- 최대 50줄 변경
- 테스트 코드 함께 수정 금지

## 설정
- **리포지토리 목록**: `config/code-repositories.json`
- **패치 패턴**: `config/patch-patterns.json`
- **배포 설정**: `config/deployment-config.json`

## 사용 예제

### 자동 패치 생성
```javascript
const patch = await codeHealer.generatePatch({
  issue: 'connection_leak',
  file: 'src/db/pool.js',
  pattern: 'missing_finally'
});
```

### 핫픽스 배포
```javascript
const deployment = await codeHealer.deployHotfix({
  patch,
  strategy: 'canary',
  autoRollback: true
});
```

### 수동 검토 요청
```javascript
const pr = await codeHealer.createPR({
  patch,
  reviewers: ['@tech-lead', '@senior-dev']
});
```

## 통합 포인트
- **Diagnostic Agent**: 진단 결과 기반 패치 생성
- **SSH Agent**: 원격 서버 배포 실행
- **Orchestrator**: 전체 워크플로우 조율
- **Reporter**: 패치 및 배포 결과 보고

## 제약사항
- JavaScript/TypeScript/Python만 지원 (초기)
- 단일 파일 수정만 자동화
- 테스트 코드 있는 경우만 자동 배포
- 프로덕션 배포는 비즈니스 시간 외 권장
