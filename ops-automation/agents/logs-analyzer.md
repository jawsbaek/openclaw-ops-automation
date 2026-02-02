# Logs Analyzer Agent

## 역할
로그 파일을 분석하여 에러 패턴, 이상 징후, 보안 위협을 감지합니다.

## 실행 모드
- **세션 타입**: Isolated (스케줄 기반)
- **트리거**: Cron (10분마다)
- **모델**: claude-sonnet-4-5

## 분석 대상

### 로그 파일
`config/monitoring-sources.json`에서 정의:
```json
{
  "logs": {
    "paths": [
      "/tmp/openclaw/openclaw-*.log",
      "/var/log/system.log",
      "/usr/local/var/log/nginx/*.log"
    ]
  }
}
```

### 분석 항목
1. **에러 패턴**: ERROR, FATAL, Exception 등
2. **성능 이슈**: slow query, timeout, latency
3. **보안 위협**: failed login, unauthorized, suspicious activity
4. **비정상 패턴**: 급격한 로그 증가, 반복적인 에러

## 분석 로직

```javascript
async function analyzeLogs() {
  const config = JSON.parse(readFile('config/monitoring-sources.json'));
  const logPaths = config.logs.paths;
  
  const analysis = {
    timestamp: new Date().toISOString(),
    errors: [],
    warnings: [],
    insights: [],
    anomalies: []
  };
  
  for (const pattern of logPaths) {
    const files = glob(pattern);
    
    for (const file of files) {
      // 최근 10분간의 로그만 분석
      const recentLines = getRecentLines(file, 600); // 600초
      
      // 에러 패턴 매칭
      const errors = findErrors(recentLines);
      analysis.errors.push(...errors);
      
      // 경고 패턴
      const warnings = findWarnings(recentLines);
      analysis.warnings.push(...warnings);
      
      // 이상 패턴
      const anomalies = detectAnomalies(recentLines);
      analysis.anomalies.push(...anomalies);
    }
  }
  
  // AI 인사이트 생성
  if (analysis.errors.length > 0 || analysis.anomalies.length > 0) {
    analysis.insights = await generateInsights(analysis);
  }
  
  // 결과 저장
  const filename = `analysis/log-insights-${formatDate()}.md`;
  await writeAnalysisReport(filename, analysis);
  
  // 심각한 이슈가 있으면 알람
  if (hasCriticalIssues(analysis)) {
    await sessions_spawn({
      agentId: 'alert-handler',
      task: `Handle log analysis alerts: ${JSON.stringify(analysis)}`
    });
  }
  
  return analysis;
}
```

## 에러 패턴 감지

```javascript
function findErrors(lines) {
  const errorPatterns = [
    /ERROR/i,
    /FATAL/i,
    /Exception:/i,
    /failed/i,
    /timeout/i,
    /cannot connect/i
  ];
  
  const errors = [];
  
  for (const line of lines) {
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        errors.push({
          type: 'error',
          pattern: pattern.source,
          line: line,
          timestamp: extractTimestamp(line)
        });
      }
    }
  }
  
  return errors;
}
```

## 이상 패턴 감지

### 1. 급격한 로그 증가
```javascript
function detectLogSpike(lines) {
  const buckets = groupByMinute(lines);
  const avgRate = average(buckets.map(b => b.length));
  
  for (const bucket of buckets) {
    if (bucket.length > avgRate * 5) { // 5배 이상
      return {
        type: 'log_spike',
        severity: 'warning',
        message: `Log rate spiked to ${bucket.length} lines/min (avg: ${avgRate})`
      };
    }
  }
  
  return null;
}
```

### 2. 반복적인 에러
```javascript
function detectRepeatingErrors(errors) {
  const counts = {};
  
  for (const error of errors) {
    const key = normalizeError(error.line);
    counts[key] = (counts[key] || 0) + 1;
  }
  
  const repeating = [];
  for (const [error, count] of Object.entries(counts)) {
    if (count > 10) { // 10회 이상 반복
      repeating.push({
        type: 'repeating_error',
        error: error,
        count: count,
        severity: count > 50 ? 'critical' : 'warning'
      });
    }
  }
  
  return repeating;
}
```

### 3. 보안 위협
```javascript
function detectSecurityThreats(lines) {
  const threats = [];
  
  const securityPatterns = [
    { pattern: /failed.*login/i, severity: 'warning', type: 'failed_login' },
    { pattern: /unauthorized/i, severity: 'warning', type: 'unauthorized_access' },
    { pattern: /SQL injection/i, severity: 'critical', type: 'sql_injection' },
    { pattern: /brute.*force/i, severity: 'critical', type: 'brute_force' }
  ];
  
  for (const line of lines) {
    for (const sp of securityPatterns) {
      if (sp.pattern.test(line)) {
        threats.push({
          type: sp.type,
          severity: sp.severity,
          line: line,
          timestamp: extractTimestamp(line)
        });
      }
    }
  }
  
  return threats;
}
```

## AI 인사이트 생성

```javascript
async function generateInsights(analysis) {
  // 에러 요약
  const errorSummary = summarizeErrors(analysis.errors);
  
  // GPT에게 분석 요청
  const prompt = `
다음 로그 분석 결과를 검토하여:
1. 근본 원인 추정
2. 영향도 평가
3. 권장 조치사항
을 제안해주세요.

에러: ${JSON.stringify(errorSummary)}
이상 패턴: ${JSON.stringify(analysis.anomalies)}
  `;
  
  const insights = await askAI(prompt);
  
  return insights;
}
```

## 출력 형식

### analysis/log-insights-YYYY-MM-DD-HHmm.md
```markdown
# 로그 분석 리포트 - 2026-02-02 11:22

## 📊 요약
- **분석 기간**: 11:12 ~ 11:22 (10분)
- **총 로그 라인**: 12,453
- **에러**: 23건
- **경고**: 45건
- **이상 패턴**: 2건

## ❌ 주요 에러

### 1. Database connection timeout (15회)
```
2026-02-02 11:15:23 ERROR [db] Connection timeout after 30s
2026-02-02 11:16:45 ERROR [db] Connection timeout after 30s
...
```

**영향**: API 응답 지연 (avg: 2.3s)
**권장 조치**: 데이터베이스 연결 풀 크기 증가

### 2. File not found (8회)
```
2026-02-02 11:18:12 ERROR [fs] ENOENT: no such file '/tmp/cache/user123.json'
```

**영향**: 캐시 미스, 성능 저하
**권장 조치**: 캐시 디렉토리 존재 여부 확인 로직 추가

## ⚠️ 이상 패턴

### 로그 급증 (11:15)
- **평균 로그**: 1,200 lines/min
- **피크**: 6,500 lines/min (5.4배)
- **원인 추정**: 반복적인 API 호출 실패

### 반복적인 재시도
- **패턴**: "Retrying request (attempt X/10)"
- **빈도**: 120회 / 10분
- **근본 원인**: 외부 API 불안정

## 🔒 보안 이슈
발견되지 않음

## 💡 AI 인사이트

1. **데이터베이스 연결 이슈**가 주요 문제입니다.
   - 연결 풀 고갈로 인한 타임아웃 반복
   - 권장: max_connections를 50 → 100으로 증가

2. **외부 API 의존성**이 시스템 안정성에 영향을 미치고 있습니다.
   - Circuit breaker 패턴 도입 권장
   - 재시도 로직에 exponential backoff 적용

3. **캐시 미스**가 빈번하게 발생합니다.
   - 캐시 워밍 스크립트 검토 필요

## 📈 트렌드 (전 기간 대비)
- 에러율: +15% ⬆️
- 로그 볼륨: +8% ⬆️
- 보안 위협: 0건 (변동 없음)

## 🔗 관련 링크
- [전체 로그](/var/log/system.log)
- [메트릭 데이터](../metrics/2026-02-02-1122.json)
```

## 통합

### Elasticsearch 전송
```bash
# 분석 결과를 Elasticsearch에 인덱싱
curl -X POST http://localhost:9200/log-analysis/_doc \
  -H 'Content-Type: application/json' \
  -d @analysis/log-insights-2026-02-02-1122.json
```

### Slack 알림
중요한 발견사항은 Slack으로:
```javascript
if (analysis.errors.length > 50 || analysis.anomalies.some(a => a.severity === 'critical')) {
  await message({
    action: 'send',
    channel: 'slack',
    target: '#ops-alerts',
    message: `🔍 로그 분석 알람\n\n에러: ${analysis.errors.length}건\n이상 패턴: ${analysis.anomalies.length}건`
  });
}
```

## 성능 최적화

```javascript
// 대용량 로그 파일 처리
function getRecentLines(file, seconds) {
  // tail 대신 효율적으로 마지막 N줄 읽기
  const cmd = `tail -n 10000 ${file} | awk -v cutoff=$(date -v-${seconds}S +%s) ...`;
  return execSync(cmd).toString().split('\n');
}
```

## 보존 정책

```bash
# 분석 결과는 90일간 보존
find analysis/ -name '*.md' -mtime +90 -delete
```
