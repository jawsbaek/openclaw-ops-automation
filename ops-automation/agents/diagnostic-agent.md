# Diagnostic Agent

## 역할
시스템 문제를 자동으로 진단하고 근본 원인을 파악하는 에이전트

## 책임

### 1. 진단 플레이북 실행
- **문제 유형별 플레이북**: 메모리, CPU, 디스크, 네트워크, 애플리케이션
- **단계별 진단**: 순차적 체크리스트 실행
- **조건부 분기**: 결과에 따라 다른 진단 경로 선택
- **결과 취합**: 모든 진단 결과 종합 분석

### 2. 로그 수집 및 분석
- **분산 로그 수집**: 여러 서버에서 병렬로 로그 수집
- **패턴 매칭**: 알려진 에러 패턴 검색
- **타임라인 구성**: 이벤트 시간순 정렬
- **상관관계 분석**: 여러 로그 간 연관성 파악

### 3. 성능 프로파일링
- **리소스 사용률**: CPU, 메모리, 디스크 I/O, 네트워크
- **프로세스 분석**: 리소스 과다 사용 프로세스 식별
- **병목 지점**: 시스템 성능 저하 원인 파악
- **트렌드 분석**: 시간에 따른 변화 추적

### 4. 상태 체크
- **서비스 상태**: systemd, docker, 애플리케이션 프로세스
- **네트워크 연결**: 포트 리스닝, 외부 연결 상태
- **파일시스템**: 디스크 사용량, inode 사용률
- **데이터베이스**: 커넥션 수, 슬로우 쿼리, 락

## 입력
```javascript
{
  "alertId": "alert-12345",
  "alertType": "high_memory_usage",
  "severity": "warning",
  "target": "web-servers",
  "context": {
    "metric": "memory_percent",
    "value": 92,
    "threshold": 85
  }
}
```

## 출력
```javascript
{
  "diagnosisId": "diag-67890",
  "alertId": "alert-12345",
  "rootCause": {
    "type": "memory_leak",
    "component": "nodejs_process",
    "confidence": 0.85,
    "evidence": [
      "프로세스 PID 12345 메모리 지속 증가 (6시간)",
      "힙 사용률 95%, Old Space 증가",
      "GC 빈도 증가, Major GC 지속 시간 증가"
    ]
  },
  "affectedHosts": ["web1.example.com", "web2.example.com"],
  "diagnosticSteps": [
    {
      "step": "메모리 사용률 확인",
      "command": "free -m",
      "result": "Used: 7890MB / 8192MB (96%)"
    },
    {
      "step": "프로세스별 메모리 사용",
      "command": "ps aux --sort=-rss | head -10",
      "result": "node process using 6GB RSS"
    }
  ],
  "recommendations": [
    {
      "action": "restart_process",
      "target": "nodejs",
      "reason": "메모리 누수로 인한 프로세스 재시작 필요",
      "urgency": "high"
    },
    {
      "action": "code_investigation",
      "target": "memory_management",
      "reason": "근본적인 메모리 누수 원인 코드 수정 필요",
      "urgency": "medium"
    }
  ],
  "timestamp": "2026-02-02T02:45:00Z",
  "duration": 45000
}
```

## 진단 플레이북

### 메모리 이슈
1. 전체 메모리 사용률 확인
2. 프로세스별 메모리 사용 분석
3. 메모리 누수 패턴 검사
4. 스왑 사용 현황 확인
5. OOM 킬러 로그 확인

### CPU 이슈
1. CPU 사용률 및 로드 평균
2. 프로세스별 CPU 사용
3. Context switching 빈도
4. Interrupt 분석
5. 최근 CPU 스파이크 로그

### 디스크 이슈
1. 디스크 사용량 (파티션별)
2. Inode 사용률
3. 디스크 I/O 통계
4. 큰 파일/디렉토리 탐색
5. 로그 파일 크기 확인

### 네트워크 이슈
1. 네트워크 인터페이스 상태
2. 리스닝 포트 확인
3. 활성 연결 수
4. 네트워크 에러/드랍
5. DNS 해석 테스트

### 애플리케이션 이슈
1. 서비스 상태 (systemctl, docker ps)
2. 애플리케이션 로그 에러
3. 응답 시간 측정
4. 데이터베이스 연결 상태
5. 캐시 히트율

## 설정
- **플레이북 정의**: `config/diagnostic-playbooks.json`
- **로그 경로**: 서버별 로그 위치 매핑
- **진단 타임아웃**: 플레이북별 최대 실행 시간

## 사용 예제

### 자동 진단 실행
```javascript
const diagnosis = await diagnosticAgent.diagnose({
  alertType: "high_cpu",
  target: "web1.example.com"
});

console.log(`근본 원인: ${diagnosis.rootCause.type}`);
console.log(`권장 조치: ${diagnosis.recommendations[0].action}`);
```

### 특정 플레이북 실행
```javascript
const result = await diagnosticAgent.runPlaybook({
  playbook: "memory_leak_detection",
  target: "web-servers"
});
```

## 통합 포인트
- **Alert Handler**: 알람 발생 시 자동 진단 트리거
- **SSH Agent**: 원격 진단 명령 실행
- **Code Healer**: 진단 결과 기반 자동 패치
- **Reporter**: 진단 결과 보고

## 에러 처리
- **진단 실패**: 부분 결과라도 반환
- **타임아웃**: 단계별 타임아웃 적용
- **권한 부족**: 실행 가능한 진단만 수행
- **서버 접근 불가**: 메트릭 데이터로 대체 진단

## 성능 고려사항
- 진단 명령은 시스템 부하 최소화
- 병렬 실행으로 진단 시간 단축
- 캐싱을 통한 중복 진단 방지
- 로그 수집 크기 제한

## 제약사항
- 플레이북 실행 시간: 최대 5분
- 로그 수집: 서버당 최대 100MB
- 동시 진단: 최대 10개
