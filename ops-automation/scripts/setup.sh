#!/bin/bash
# ops-automation 초기 설정 스크립트

set -e

echo "🚀 OpenClaw 운영 자동화 시스템 설정 시작..."

# 1. 필요한 디렉토리 생성
echo "📁 디렉토리 구조 생성 중..."
mkdir -p metrics
mkdir -p analysis
mkdir -p incidents
mkdir -p reports
mkdir -p status
mkdir -p logs

# 2. 초기 상태 파일 생성
echo "📝 초기 상태 파일 생성 중..."
cat > status/dashboard.md <<EOF
# 운영 대시보드

마지막 업데이트: $(date)

시스템이 준비 중입니다...
EOF

cat > status/agents.json <<EOF
{
  "orchestrator": "not_started",
  "metrics-collector": "not_started",
  "logs-analyzer": "not_started",
  "alert-handler": "not_started",
  "autoheal": "not_started",
  "reporter": "not_started"
}
EOF

# 3. 필요한 도구 확인
echo "🔍 필수 도구 확인 중..."
command -v openclaw >/dev/null 2>&1 || { echo "❌ openclaw CLI가 설치되어 있지 않습니다."; exit 1; }
echo "✅ openclaw CLI 확인"

command -v jq >/dev/null 2>&1 || { echo "⚠️  jq가 설치되어 있지 않습니다. 설치를 권장합니다."; }
echo "✅ jq 확인 (또는 경고)"

# 4. 설정 파일 검증
echo "🔧 설정 파일 검증 중..."
for config in config/*.json; do
  if ! jq empty "$config" 2>/dev/null; then
    echo "❌ 잘못된 JSON: $config"
    exit 1
  fi
done
echo "✅ 모든 설정 파일 유효"

# 5. Cron 작업 등록 (선택사항)
echo "⏰ Cron 작업 등록을 원하시나요? (y/n)"
read -r response
if [[ "$response" == "y" ]]; then
  echo "Cron 작업 등록 중..."
  
  # Metrics Collector - 5분마다
  cron add --action systemEvent \
    --sessionTarget main \
    --schedule '{"kind":"every","everyMs":300000}' \
    --payload '{"kind":"systemEvent","text":"Run metrics collector"}' \
    --name "Metrics Collector (5min)"
  
  # Daily Report - 매일 9시
  cron add --action systemEvent \
    --sessionTarget main \
    --schedule '{"kind":"cron","expr":"0 9 * * *","tz":"Asia/Seoul"}' \
    --payload '{"kind":"systemEvent","text":"Generate daily ops report"}' \
    --name "Daily Ops Report"
  
  echo "✅ Cron 작업 등록 완료"
else
  echo "⏭️  Cron 작업 건너뛰기"
fi

# 6. 초기 메트릭 수집
echo "📊 초기 메트릭 수집 중..."
cat > metrics/initial.json <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "system": {
    "cpu_percent": 0,
    "memory_gb_used": 0,
    "disk_percent": 0
  },
  "status": "initialized"
}
EOF

# 7. 완료 메시지
echo ""
echo "✅ 설정 완료!"
echo ""
echo "다음 단계:"
echo "1. Orchestrator 시작: openclaw agents spawn ops-orchestrator"
echo "2. 상태 확인: cat ops-automation/status/dashboard.md"
echo "3. 수동 메트릭 수집: openclaw agents spawn metrics-collector"
echo ""
echo "설정 파일 위치:"
echo "- 모니터링 소스: ops-automation/config/monitoring-sources.json"
echo "- 알람 임계값: ops-automation/config/alert-thresholds.json"
echo "- AutoHeal 플레이북: ops-automation/config/autoheal-playbooks.json"
echo ""
echo "Happy monitoring! 🎉"
