# SSH Agent

## 역할
다중 서버에 대한 SSH 연결을 관리하고 원격 명령을 안전하게 실행하는 에이전트

## 책임

### 1. 연결 관리
- **연결 풀 관리**: 서버별 SSH 연결 유지 및 재사용
- **세션 타임아웃**: 유휴 연결 자동 종료
- **재연결 로직**: 연결 실패 시 자동 재시도
- **동시 연결 제한**: 리소스 보호를 위한 최대 연결 수 제한

### 2. 명령 실행
- **안전한 실행**: 화이트리스트 기반 명령 검증
- **타임아웃 제어**: 장기 실행 명령 타임아웃
- **출력 캡처**: stdout, stderr 분리 수집
- **종료 코드 체크**: 명령 성공/실패 판단

### 3. 보안
- **키 관리**: SSH 키 안전 저장 및 로드
- **권한 검증**: 서버별 실행 가능 명령 제한
- **감사 로깅**: 모든 SSH 활동 기록
- **승인 워크플로우**: 위험한 명령은 사전 승인 필요

### 4. 모니터링
- **연결 상태**: 활성 연결 추적
- **명령 이력**: 실행된 명령 기록
- **오류 추적**: 연결/실행 실패 로그

## 입력
```javascript
{
  "action": "execute",
  "target": "web-servers",  // 서버 그룹 또는 개별 호스트
  "command": "systemctl status nginx",
  "options": {
    "timeout": 30000,      // ms
    "requireApproval": false,
    "dryRun": false,
    "parallel": true       // 그룹 실행 시 병렬 처리
  }
}
```

## 출력
```javascript
{
  "success": true,
  "results": [
    {
      "host": "web1.example.com",
      "exitCode": 0,
      "stdout": "● nginx.service - A high performance web server...",
      "stderr": "",
      "duration": 234,     // ms
      "timestamp": "2026-02-02T02:38:00Z"
    }
  ],
  "summary": {
    "total": 2,
    "succeeded": 2,
    "failed": 0
  }
}
```

## 설정
- **서버 인벤토리**: `config/servers.json`
- **명령 화이트리스트**: `config/ssh-whitelist.json`
- **SSH 키 경로**: 환경 변수 `SSH_KEY_PATH`

## 에러 처리
- **연결 실패**: 재시도 후 실패 보고
- **타임아웃**: 명령 종료 후 타임아웃 에러
- **권한 거부**: 즉시 실패 반환
- **부분 실패**: 성공한 서버와 실패한 서버 구분

## 사용 예제

### 단일 서버 상태 확인
```javascript
const result = await sshAgent.execute({
  target: "db-master.example.com",
  command: "ps aux | grep postgres"
});
```

### 그룹 병렬 실행
```javascript
const result = await sshAgent.execute({
  target: "web-servers",
  command: "df -h /var/log",
  options: { parallel: true }
});
```

### 승인 필요한 명령
```javascript
const result = await sshAgent.execute({
  target: "production",
  command: "systemctl restart nginx",
  options: { requireApproval: true }
});
// → 사용자 승인 대기 후 실행
```

## 통합 포인트
- **Diagnostic Agent**: 진단 명령 실행
- **AutoHeal Agent**: 자동 복구 액션 실행
- **Orchestrator**: 전체 워크플로우 조율

## 보안 고려사항
- SSH 키는 절대 로그에 기록하지 않음
- 민감한 명령(rm, dd 등)은 승인 필수
- 모든 원격 실행은 감사 로그에 기록
- 연결 실패 시 백도어 시도 감지

## 제약사항
- 최대 동시 연결: 50개
- 명령 타임아웃: 기본 30초, 최대 5분
- 연결 풀 크기: 서버당 1개 (재사용)
