# AutoHeal Agent

## 역할
일반적인 운영 문제를 자동으로 감지하고 복구합니다.

## 실행 모드
- **세션 타입**: Isolated (이벤트 기반)
- **트리거**: Alert Handler가 호출
- **모델**: claude-sonnet-4-5

## 복구 시나리오

### 1. 디스크 공간 부족
```bash
# 조건: disk_usage > 90%
# 복구 액션:

# 1. 임시 파일 정리 (7일 이상 된 것)
find /tmp -type f -mtime +7 -delete

# 2. 오래된 로그 삭제 (30일 이상)
find /var/log -name '*.log.*' -mtime +30 -delete

# 3. Docker 정리
docker system prune -f --volumes

# 4. npm/yarn 캐시 정리
npm cache clean --force
yarn cache clean

# 5. Homebrew 정리
brew cleanup
```

### 2. 프로세스 다운
```bash
# 조건: process_status == 'stopped'
# 복구 액션:

case "$SERVICE" in
  openclaw-gateway)
    openclaw gateway restart
    ;;
  nginx)
    brew services restart nginx
    ;;
  postgres)
    brew services restart postgresql
    ;;
  *)
    echo "Unknown service: $SERVICE"
    ;;
esac
```

### 3. 메모리 누수
```bash
# 조건: memory_usage > 95% && process_memory > threshold
# 복구 액션:

# 1. 메모리 많이 쓰는 프로세스 식별
ps aux | sort -nrk 4 | head -5

# 2. 재시작 가능한 프로세스면 재시작
if [[ "$PROCESS" == "node" ]]; then
  pkill -f "openclaw"
  openclaw gateway start
fi
```

### 4. API 응답 지연
```bash
# 조건: api_latency_ms > 2000
# 복구 액션:

# 1. 연결 풀 재설정
curl -X POST http://localhost:8080/admin/reset-pool

# 2. 캐시 flush
redis-cli FLUSHALL

# 3. 웹서버 재시작 (최후 수단)
nginx -s reload
```

### 5. SSL 인증서 만료 임박
```bash
# 조건: ssl_expires_in_days < 7
# 복구 액션:

# Let's Encrypt 갱신
certbot renew --quiet

# 웹서버 reload
nginx -s reload
```

### 6. 로그 파일 비대화
```bash
# 조건: log_file_size_mb > 1000
# 복구 액션:

# 로그 로테이트 강제 실행
logrotate -f /etc/logrotate.conf

# 또는 수동 압축
gzip /var/log/system.log
mv /var/log/system.log.gz /var/log/archive/
```

## Playbook 구조

`config/autoheal-playbooks.json`:
```json
{
  "disk_space_low": {
    "condition": {
      "metric": "disk_usage",
      "operator": ">",
      "threshold": 90
    },
    "actions": [
      {
        "type": "shell",
        "command": "find /tmp -type f -mtime +7 -delete",
        "description": "Clean old temp files"
      },
      {
        "type": "shell",
        "command": "find /var/log -name '*.log.*' -mtime +30 -delete",
        "description": "Remove old log archives"
      },
      {
        "type": "shell",
        "command": "docker system prune -f",
        "description": "Clean Docker resources"
      }
    ],
    "verify": {
      "metric": "disk_usage",
      "operator": "<",
      "threshold": 85,
      "retry_count": 3,
      "retry_interval_seconds": 60
    }
  },
  "process_down": {
    "condition": {
      "metric": "process_status",
      "operator": "==",
      "value": "stopped"
    },
    "actions": [
      {
        "type": "service_restart",
        "service": "{process_name}",
        "description": "Restart the stopped process"
      }
    ],
    "verify": {
      "metric": "process_status",
      "operator": "==",
      "value": "running"
    }
  }
}
```

## 실행 플로우

```javascript
async function autoHeal(incident) {
  const playbook = findPlaybook(incident.type);
  
  if (!playbook) {
    return { status: 'no_playbook', message: 'No playbook found for this incident' };
  }

  // 인시던트 기록 시작
  const incidentId = generateId();
  const incidentFile = `incidents/${formatDate()}-${incidentId}.md`;
  
  await write(incidentFile, `
# Incident ${incidentId}

- **Type**: ${incident.type}
- **Detected**: ${new Date().toISOString()}
- **Severity**: ${incident.severity}
- **Trigger**: ${incident.trigger}

## Initial State
\`\`\`json
${JSON.stringify(incident.metrics, null, 2)}
\`\`\`

## Actions Taken
`);

  // 액션 실행
  const results = [];
  for (const action of playbook.actions) {
    const result = await executeAction(action, incident);
    results.push(result);
    
    // 인시던트 파일에 기록
    await appendToFile(incidentFile, `
### ${action.description}
- **Command**: \`${action.command}\`
- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}
- **Output**: 
\`\`\`
${result.output}
\`\`\`
`);
    
    if (!result.success) {
      // 실패하면 중단하고 에스컬레이션
      return await escalate(incident, results);
    }
  }

  // 검증
  const verified = await verifyFix(playbook.verify);
  
  await appendToFile(incidentFile, `
## Verification
- **Status**: ${verified ? '✅ Resolved' : '❌ Still failing'}
- **Final State**:
\`\`\`json
${JSON.stringify(await getCurrentMetrics(), null, 2)}
\`\`\`
`);

  if (verified) {
    return { status: 'resolved', incidentId, results };
  } else {
    return await escalate(incident, results);
  }
}
```

## 안전 장치

### 1. 화이트리스트
허용된 명령만 실행:
```javascript
const ALLOWED_COMMANDS = [
  /^find \/tmp/,
  /^find \/var\/log/,
  /^docker system prune/,
  /^brew (services restart|cleanup)/,
  /^openclaw gateway (start|stop|restart)/,
  /^nginx -s reload/,
  /^certbot renew/
];

function isSafeCommand(command) {
  return ALLOWED_COMMANDS.some(pattern => pattern.test(command));
}
```

### 2. Dry-run 모드
```bash
# 설정에서 dry_run: true이면 실제 실행 안 함
if (config.dry_run) {
  console.log(`[DRY RUN] Would execute: ${command}`);
  return { success: true, output: '[dry run]' };
}
```

### 3. 승인 요구
중요한 액션은 사용자 승인 필요:
```javascript
if (action.requires_approval) {
  await notifyUser(`AutoHeal wants to run: ${action.description}. Approve? (yes/no)`);
  const response = await waitForUserResponse(timeout: 300); // 5분 대기
  if (response !== 'yes') {
    return { status: 'denied', message: 'User denied approval' };
  }
}
```

### 4. Rate Limiting
같은 액션을 짧은 시간에 반복 실행 방지:
```javascript
const lastRun = getLastRunTime(playbook.id);
if (Date.now() - lastRun < 300000) { // 5분 이내
  return { status: 'rate_limited', message: 'This playbook ran recently' };
}
```

## 에스컬레이션

자동 복구 실패 시:
```javascript
async function escalate(incident, attemptedActions) {
  // 사용자에게 알림
  await notifyUser(`
🚨 AutoHeal 실패

**인시던트**: ${incident.type}
**심각도**: ${incident.severity}
**시도한 액션**: ${attemptedActions.length}개
**결과**: 복구 실패

수동 개입이 필요합니다.

상세 내용: incidents/${incident.id}.md
  `);

  // PagerDuty/Opsgenie 통합이 있으면
  if (config.pagerduty_enabled) {
    await triggerPagerDuty(incident);
  }
}
```

## 모니터링

AutoHeal 자체도 모니터링:
- 성공률
- 평균 복구 시간
- 가장 많이 발생하는 인시던트
- 반복 발생하는 문제 (근본 원인 분석 필요)

## 테스트

```bash
# 테스트 스크립트
./scripts/test-autoheal.sh

# 디스크 공간 부족 시뮬레이션
dd if=/dev/zero of=/tmp/test.img bs=1G count=10

# AutoHeal 호출
openclaw agents spawn autoheal --task "Fix disk_space_low incident"

# 정리
rm /tmp/test.img
```
