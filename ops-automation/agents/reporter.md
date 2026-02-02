# Reporter Agent

## 역할
시스템 상태 및 인시던트를 주기적으로 분석하여 리포트를 생성합니다.

## 실행 모드
- **세션 타입**: Isolated (스케줄 기반)
- **트리거**: Cron (일일/주간/월간)
- **모델**: claude-sonnet-4-5

## 리포트 종류

### 1. 일일 운영 리포트
**스케줄**: 매일 09:00
**파일**: `reports/daily-ops-YYYY-MM-DD.md`

```markdown
# 일일 운영 리포트 - 2026-02-02

## 📊 시스템 개요
- **가동 시간**: 15일 3시간
- **전체 상태**: ✅ 정상
- **인시던트**: 2건 (모두 자동 복구)

## 🖥️ 리소스 사용률 (24시간 평균)
- CPU: 42.3% (피크: 78.5% @ 14:32)
- 메모리: 11.2GB / 16GB (70%)
- 디스크: 68.3% (안정)
- 네트워크: ↓ 1.2GB ↑ 450MB

## 📈 트렌드 (전일 대비)
- CPU: +5.2% ⬆️
- 메모리: -1.1% ⬇️
- 디스크: +0.3% →

## 🚨 인시던트 요약
1. **디스크 공간 부족** (08:15)
   - 임계값: 90% 초과 (92.1%)
   - 조치: AutoHeal - 임시 파일 정리
   - 결과: ✅ 복구 (67.8%)
   - 소요 시간: 3분

2. **API 응답 지연** (14:32)
   - 평균 응답: 2.3초 (임계값: 2.0초)
   - 조치: 연결 풀 재설정
   - 결과: ✅ 복구 (0.5초)
   - 소요 시간: 1분

## 🔄 AutoHeal 통계
- 총 실행: 2회
- 성공: 2회 (100%)
- 실패: 0회
- 평균 복구 시간: 2분

## 🌐 API 헬스체크
- /health: ✅ 200 OK (avg: 45ms)
- /metrics: ✅ 200 OK (avg: 32ms)
- /api/v1: ✅ 200 OK (avg: 123ms)

## 📝 권장 사항
- CPU 사용률이 증가 추세 → 리소스 모니터링 강화 권장
- 디스크 정리가 반복됨 → 로그 로테이션 정책 검토 필요

## 🔗 상세 데이터
- [전체 메트릭](metrics/2026-02-02/)
- [인시던트 로그](incidents/2026-02-02/)
```

### 2. 주간 요약 리포트
**스케줄**: 매주 월요일 09:00
**파일**: `reports/weekly-ops-YYYY-WW.md`

```markdown
# 주간 운영 리포트 - 2026년 5주차

## 📅 기간
2026-01-27 ~ 2026-02-02 (7일)

## 🎯 주요 지표
| 항목 | 평균 | 최소 | 최대 | 트렌드 |
|------|------|------|------|--------|
| CPU | 38.2% | 12.5% | 78.5% | ⬆️ +3% |
| 메모리 | 10.8GB | 8.2GB | 14.1GB | → 0% |
| 디스크 | 67.9% | 65.2% | 92.1% | ⬆️ +2% |
| API 지연 | 0.45s | 0.32s | 2.3s | → 0% |

## 🚨 인시던트 분석
- **총 인시던트**: 12건
- **자동 복구**: 11건 (91.7%)
- **수동 개입**: 1건 (8.3%)
- **평균 복구 시간**: 2.5분

### 인시던트 유형별
1. 디스크 공간 부족: 5건 (42%)
2. API 응답 지연: 4건 (33%)
3. 프로세스 다운: 2건 (17%)
4. 메모리 누수: 1건 (8%)

### 반복 발생 패턴
- 디스크 공간 부족이 주 2-3회 발생 → **근본 원인 분석 필요**
- API 지연이 목요일 오후에 집중 → 트래픽 패턴 조사

## 💡 개선 제안
1. **디스크 관리**: 로그 로테이션 주기를 14일 → 7일로 단축
2. **API 성능**: 목요일 오후 트래픽 대응 위해 캐싱 강화
3. **모니터링**: 메모리 누수 감지 임계값 조정 (95% → 90%)

## 📊 가용성
- **목표 SLA**: 99.9%
- **실제**: 99.95%
- **다운타임**: 총 3분 (프로세스 재시작)
```

### 3. 월간 트렌드 리포트
**스케줄**: 매월 1일 09:00
**파일**: `reports/monthly-ops-YYYY-MM.md`

장기 트렌드, 비용 분석, 용량 계획, 최적화 권장사항 포함.

## 데이터 소스

```javascript
async function generateDailyReport() {
  // 1. 메트릭 집계
  const metricsFiles = glob('metrics/2026-02-02-*.json');
  const metrics = metricsFiles.map(f => JSON.parse(readFile(f)));
  
  const avgCpu = average(metrics.map(m => m.system.cpu_percent));
  const avgMemory = average(metrics.map(m => m.system.memory_gb_used));
  
  // 2. 인시던트 수집
  const incidents = glob('incidents/2026-02-02-*.md');
  
  // 3. AutoHeal 통계
  const autoHealStats = incidents.filter(i => 
    readFile(i).includes('AutoHeal')
  );
  
  // 4. 리포트 생성
  const report = `
# 일일 운영 리포트 - ${today}

## 시스템 개요
- CPU 평균: ${avgCpu.toFixed(1)}%
- 메모리 평균: ${avgMemory.toFixed(1)}GB
...
  `;
  
  await write(`reports/daily-ops-${today}.md`, report);
}
```

## 시각화

### 차트 생성 (gnuplot 또는 Python)
```bash
# CPU 사용률 그래프
gnuplot <<EOF
set terminal png size 800,600
set output 'reports/charts/cpu-trend-7d.png'
set title 'CPU Usage - Last 7 Days'
set xlabel 'Date'
set ylabel 'CPU %'
plot 'metrics/aggregated/cpu-7d.dat' using 1:2 with lines
EOF
```

### 대시보드 HTML
```html
<!-- reports/dashboard.html -->
<!DOCTYPE html>
<html>
<head>
  <title>운영 대시보드</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>시스템 상태</h1>
  <canvas id="cpuChart"></canvas>
  <script>
    fetch('metrics/aggregated/7d.json')
      .then(r => r.json())
      .then(data => {
        new Chart(document.getElementById('cpuChart'), {
          type: 'line',
          data: {
            labels: data.timestamps,
            datasets: [{
              label: 'CPU %',
              data: data.cpu,
              borderColor: 'rgb(75, 192, 192)'
            }]
          }
        });
      });
  </script>
</body>
</html>
```

## 배포

### Slack/Discord 전송
```bash
# 일일 리포트를 Slack으로 전송
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"$(cat reports/daily-ops-2026-02-02.md)\"}"
```

### 이메일 발송
```bash
# Himalaya CLI 사용
himalaya send \
  --to ops-team@example.com \
  --subject "일일 운영 리포트 - 2026-02-02" \
  --body "$(cat reports/daily-ops-2026-02-02.md)"
```

## 커스터마이징

`config/reporter-config.json`:
```json
{
  "daily_report": {
    "enabled": true,
    "schedule": "0 9 * * *",
    "recipients": ["imessage:+821062515961", "slack:#ops"],
    "include_charts": true,
    "sections": [
      "overview",
      "resources",
      "incidents",
      "recommendations"
    ]
  },
  "weekly_report": {
    "enabled": true,
    "schedule": "0 9 * * 1",
    "recipients": ["email:team@example.com"],
    "include_trends": true
  },
  "monthly_report": {
    "enabled": true,
    "schedule": "0 9 1 * *",
    "recipients": ["email:management@example.com"],
    "include_cost_analysis": true
  }
}
```

## 인사이트 자동 생성

AI를 활용한 인사이트:
```javascript
async function generateInsights(metrics, incidents) {
  // GPT에게 요약 요청
  const summary = await askAI(`
다음 메트릭과 인시던트를 분석하여:
1. 주요 이슈 3가지
2. 개선 제안 3가지
를 간결하게 정리해주세요.

메트릭: ${JSON.stringify(metrics)}
인시던트: ${JSON.stringify(incidents)}
  `);
  
  return summary;
}
```
