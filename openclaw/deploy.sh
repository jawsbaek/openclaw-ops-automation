#!/bin/bash

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Deploying OpenClaw Ops Monitoring"
echo "📁 Repository: $REPO_DIR"
echo ""

# 1. Check Node.js version
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   Node.js: $NODE_VERSION"

if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

# 2. Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$REPO_DIR"

if command -v pnpm &> /dev/null; then
    echo "   Using pnpm..."
    pnpm install
elif command -v npm &> /dev/null; then
    echo "   Using npm..."
    npm install
else
    echo "❌ Error: Neither npm nor pnpm found."
    exit 1
fi

echo "✅ Dependencies installed"

# 3. Create output directories
echo ""
echo "📂 Creating output directories..."
mkdir -p "$REPO_DIR/metrics"
mkdir -p "$REPO_DIR/analysis"
mkdir -p "$REPO_DIR/incidents"
mkdir -p "$REPO_DIR/reports"
mkdir -p "$REPO_DIR/logs"

# Create .gitkeep files
touch "$REPO_DIR/metrics/.gitkeep"
touch "$REPO_DIR/analysis/.gitkeep"
touch "$REPO_DIR/incidents/.gitkeep"
touch "$REPO_DIR/reports/.gitkeep"
touch "$REPO_DIR/logs/.gitkeep"

echo "✅ Output directories created"

# 4. Test workers
echo ""
echo "🧪 Testing workers..."

echo "   Testing metrics collector..."
if npm run worker:metrics &> /dev/null; then
    echo "   ✅ Metrics worker OK"
else
    echo "   ⚠️  Metrics worker test failed (may need config)"
fi

echo "   Testing logs analyzer..."
if npm run worker:logs &> /dev/null; then
    echo "   ✅ Logs analyzer OK"
else
    echo "   ⚠️  Logs analyzer test failed (may need config)"
fi

# 5. Show configuration info
echo ""
echo "📋 Configuration files:"
echo "   - openclaw/config/monitoring-sources.json"
echo "   - openclaw/config/alert-thresholds.json"
echo "   - openclaw/config/autoheal-playbooks.json"
echo "   - openclaw/config/ssh-whitelist.json"
echo "   - openclaw/config/jsm-config.json"

# 6. Show next steps
cat <<EOF

✅ Deployment complete!

📊 Output directories:
   - metrics/     System metrics (JSON, time-series)
   - analysis/    Log analysis (Markdown)
   - incidents/   Incident records (Markdown)
   - reports/     Daily/weekly reports (Markdown)
   - logs/        Worker logs

🎯 Next steps:

1. Setup automated monitoring (cron jobs):
   
   bash openclaw/setup-cron.sh
   
   Then run the displayed commands in OpenClaw.

2. Configure monitoring sources:
   
   Edit openclaw/config/monitoring-sources.json

3. Test workers manually:
   
   npm run worker:metrics   # Collect metrics
   npm run worker:logs      # Analyze logs
   npm run worker:reporter  # Generate report

4. Use as OpenClaw skill:
   
   Read openclaw/SKILL.md for usage patterns

📚 Documentation:
   - openclaw/AGENTS.md  - Agent architecture
   - openclaw/SKILL.md   - Skill usage guide
   - README.md           - Project overview

🔒 Security:
   - Review openclaw/config/ssh-whitelist.json
   - Check SECURITY.md for best practices

Happy monitoring! 🎉

EOF
