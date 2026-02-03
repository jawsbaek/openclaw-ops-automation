#!/bin/bash

INSTALL_DIR="$HOME/.openclaw/workspace/ops-monitoring"

cat <<'EOF'
⏰ OpenClaw Ops Monitoring - Cron Job Setup

Copy and run these commands in OpenClaw to setup automated monitoring:

================================================================================
1. METRICS COLLECTION (Every 5 minutes)
================================================================================

Run in main OpenClaw session or dedicated monitoring agent:

EOF

cat <<EOF
cron add \\
  --name "Ops: Metrics Collection" \\
  --schedule "*/5 * * * *" \\
  --job '{
    "name": "Ops Metrics Collection",
    "schedule": {"kind": "cron", "expr": "*/5 * * * *"},
    "payload": {
      "kind": "systemEvent",
      "text": "Run metrics collection: cd $INSTALL_DIR && npm run worker:metrics"
    },
    "sessionTarget": "main"
  }'

EOF

cat <<'EOF'

================================================================================
2. LOG ANALYSIS (Every 10 minutes)
================================================================================

EOF

cat <<EOF
cron add \\
  --name "Ops: Log Analysis" \\
  --schedule "*/10 * * * *" \\
  --job '{
    "name": "Ops Log Analysis",
    "schedule": {"kind": "cron", "expr": "*/10 * * * *"},
    "payload": {
      "kind": "systemEvent",
      "text": "Run log analysis: cd $INSTALL_DIR && npm run worker:logs"
    },
    "sessionTarget": "main"
  }'

EOF

cat <<'EOF'

================================================================================
3. DAILY REPORT (Every day at 09:00)
================================================================================

EOF

cat <<EOF
cron add \\
  --name "Ops: Daily Report" \\
  --schedule "0 9 * * *" \\
  --job '{
    "name": "Ops Daily Report",
    "schedule": {"kind": "cron", "expr": "0 9 * * *", "tz": "Asia/Seoul"},
    "payload": {
      "kind": "systemEvent",
      "text": "Generate daily ops report: cd $INSTALL_DIR && npm run worker:reporter"
    },
    "sessionTarget": "main"
  }'

EOF

cat <<'EOF'

================================================================================
4. WEEKLY REPORT (Every Monday at 10:00)
================================================================================

EOF

cat <<EOF
cron add \\
  --name "Ops: Weekly Report" \\
  --schedule "0 10 * * 1" \\
  --job '{
    "name": "Ops Weekly Report",
    "schedule": {"kind": "cron", "expr": "0 10 * * 1", "tz": "Asia/Seoul"},
    "payload": {
      "kind": "systemEvent",
      "text": "Generate weekly ops report: cd $INSTALL_DIR && npm run worker:reporter --weekly"
    },
    "sessionTarget": "main"
  }'

EOF

cat <<'EOF'

================================================================================
5. HEALTH CHECK (Every 30 minutes)
================================================================================

Optional: Proactive health monitoring

EOF

cat <<EOF
cron add \\
  --name "Ops: Health Check" \\
  --schedule "*/30 * * * *" \\
  --job '{
    "name": "Ops Health Check",
    "schedule": {"kind": "cron", "expr": "*/30 * * * *"},
    "payload": {
      "kind": "systemEvent",
      "text": "Health check: Check latest metrics and alert if issues found"
    },
    "sessionTarget": "main"
  }'

EOF

cat <<'EOF'

================================================================================
VERIFY CRON JOBS
================================================================================

After adding the jobs, verify with:

  cron list

================================================================================
REMOVE CRON JOBS
================================================================================

To remove a job:

  cron remove --name "Ops: Metrics Collection"

Or remove all ops monitoring jobs:

  cron list | grep "Ops:" | xargs -I {} cron remove --name "{}"

================================================================================
MANUAL TESTING
================================================================================

Test workers manually before setting up cron:

EOF

cat <<EOF
  cd $INSTALL_DIR
  npm run worker:metrics   # Should create metrics/*.json
  npm run worker:logs      # Should create analysis/*.md
  npm run worker:reporter  # Should create reports/*.md

EOF

cat <<'EOF'
================================================================================
NOTES
================================================================================

1. Cron times are in UTC by default. Use "tz" parameter for local timezone.
2. "sessionTarget": "main" sends output to main OpenClaw session.
3. For isolated execution, use "sessionTarget": "isolated" with "agentTurn".
4. Check logs in logs/ directory for debugging.

Happy monitoring! 🎉

EOF
