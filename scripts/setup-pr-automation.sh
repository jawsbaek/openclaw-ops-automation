#!/bin/bash

###############################################################################
# PR Auto-Review and Auto-Merge Setup Script
# 
# This script helps you configure the PR automation system quickly.
# Run this after cloning the repository.
###############################################################################

set -e

echo "🤖 PR Automation Setup"
echo "======================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if [ ! -d .git ]; then
  echo -e "${RED}❌ Error: Not in a git repository${NC}"
  exit 1
fi

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
  echo -e "${YELLOW}⚠️  GitHub CLI (gh) not found${NC}"
  echo "Please install it from: https://cli.github.com/"
  echo ""
  read -p "Continue without setting secrets? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
  SKIP_SECRETS=true
fi

echo "📋 Configuration Steps"
echo "======================"
echo ""

# 1. Check if workflows exist
echo "1️⃣  Checking workflows..."
if [ ! -f .github/workflows/pr-auto-review.yml ]; then
  echo -e "${RED}❌ pr-auto-review.yml not found${NC}"
  exit 1
fi
if [ ! -f .github/workflows/pr-auto-merge.yml ]; then
  echo -e "${RED}❌ pr-auto-merge.yml not found${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Workflows found${NC}"
echo ""

# 2. Check if scripts exist and are executable
echo "2️⃣  Checking scripts..."
for script in pr-reviewer.js security-scanner.js auto-merger.js; do
  if [ ! -f "scripts/$script" ]; then
    echo -e "${RED}❌ scripts/$script not found${NC}"
    exit 1
  fi
  chmod +x "scripts/$script"
done
echo -e "${GREEN}✅ Scripts configured${NC}"
echo ""

# 3. Set up GitHub secrets
if [ "$SKIP_SECRETS" != "true" ]; then
  echo "3️⃣  GitHub Secrets Setup"
  echo "========================"
  echo ""
  
  echo "The following secrets are needed:"
  echo "  • OPENAI_API_KEY (required for AI review)"
  echo "  • SLACK_WEBHOOK (optional for notifications)"
  echo "  • DISCORD_WEBHOOK (optional for notifications)"
  echo ""
  
  read -p "Do you want to set up secrets now? (y/n) " -n 1 -r
  echo
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # OpenAI API Key
    echo ""
    echo "OpenAI API Key:"
    echo "Get your key from: https://platform.openai.com/api-keys"
    read -p "Enter OpenAI API Key (or press Enter to skip): " openai_key
    
    if [ ! -z "$openai_key" ]; then
      gh secret set OPENAI_API_KEY --body "$openai_key"
      echo -e "${GREEN}✅ OPENAI_API_KEY set${NC}"
    else
      echo -e "${YELLOW}⚠️  Skipped OPENAI_API_KEY${NC}"
    fi
    
    # Slack Webhook
    echo ""
    echo "Slack Webhook URL:"
    echo "Create webhook at: https://api.slack.com/messaging/webhooks"
    read -p "Enter Slack Webhook URL (or press Enter to skip): " slack_webhook
    
    if [ ! -z "$slack_webhook" ]; then
      gh secret set SLACK_WEBHOOK --body "$slack_webhook"
      echo -e "${GREEN}✅ SLACK_WEBHOOK set${NC}"
    else
      echo -e "${YELLOW}⚠️  Skipped SLACK_WEBHOOK${NC}"
    fi
    
    # Discord Webhook
    echo ""
    echo "Discord Webhook URL:"
    echo "Create webhook in Server Settings → Integrations → Webhooks"
    read -p "Enter Discord Webhook URL (or press Enter to skip): " discord_webhook
    
    if [ ! -z "$discord_webhook" ]; then
      gh secret set DISCORD_WEBHOOK --body "$discord_webhook"
      echo -e "${GREEN}✅ DISCORD_WEBHOOK set${NC}"
    else
      echo -e "${YELLOW}⚠️  Skipped DISCORD_WEBHOOK${NC}"
    fi
  fi
else
  echo "3️⃣  Skipping secrets setup (GitHub CLI not available)"
fi

echo ""
echo "4️⃣  Configuration Review"
echo "========================"
echo ""

# Show current configuration
if [ -f .github/auto-review-config.yml ]; then
  echo "Current auto-review config:"
  echo "  • Auto-merge: $(grep 'enabled:' .github/auto-review-config.yml | head -1 | awk '{print $2}')"
  echo "  • Default strategy: $(grep 'strategy:' .github/auto-review-config.yml | head -1 | awk '{print $2}')"
  echo "  • Min AI score: $(grep 'ai_review_score:' .github/auto-review-config.yml | awk '{print $2}')"
  echo "  • Coverage threshold: $(grep 'coverage_threshold:' .github/auto-review-config.yml | head -1 | awk '{print $2}')%"
  echo ""
fi

read -p "Do you want to edit the configuration now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  ${EDITOR:-nano} .github/auto-review-config.yml
  echo -e "${GREEN}✅ Configuration updated${NC}"
fi

echo ""
echo "5️⃣  Branch Protection (Recommended)"
echo "===================================="
echo ""

echo "To enable branch protection:"
echo "  1. Go to Settings → Branches"
echo "  2. Add rule for 'main' branch"
echo "  3. Enable:"
echo "     • Require a pull request before merging"
echo "     • Require status checks to pass"
echo "     • Require branches to be up to date"
echo "  4. Add required status checks:"
echo "     • Code Quality Checks"
echo "     • Security Scan"
echo "     • AI Code Review"
echo ""

read -p "Press Enter when ready to continue..."

echo ""
echo "6️⃣  Test Setup"
echo "==============="
echo ""

echo "Would you like to run a test?"
read -p "Test the security scanner now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Running security scanner..."
  if command -v node &> /dev/null; then
    node scripts/security-scanner.js all || true
  else
    echo -e "${RED}❌ Node.js not found. Install from: https://nodejs.org/${NC}"
  fi
fi

echo ""
echo "========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "========================================="
echo ""
echo "📚 Next Steps:"
echo ""
echo "1. Review the documentation:"
echo "   cat docs/pr-automation-guide.md"
echo ""
echo "2. Customize allowed authors in:"
echo "   .github/auto-review-config.yml"
echo ""
echo "3. Update CODEOWNERS:"
echo "   .github/CODEOWNERS"
echo ""
echo "4. Create a test PR to verify the workflow:"
echo "   git checkout -b test/my-feature"
echo "   # make some changes"
echo "   git commit -am 'test: my feature'"
echo "   git push origin test/my-feature"
echo "   gh pr create"
echo ""
echo "5. Monitor the Actions tab on GitHub:"
echo "   https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo ""
echo "📖 Documentation:"
echo "   docs/pr-automation-guide.md"
echo ""
echo "🐛 Troubleshooting:"
echo "   Check workflow logs in GitHub Actions"
echo "   Review PR_AUTOMATION_SUMMARY.md for details"
echo ""
echo "Good luck! 🚀"
echo ""
