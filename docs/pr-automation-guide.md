# PR Auto-Review and Auto-Merge Guide

Complete guide to setting up and using the automated PR review and merge system.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Setup](#setup)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [Workflows](#workflows)
7. [Security](#security)
8. [Troubleshooting](#troubleshooting)

## Overview

This system provides automated code review and conditional auto-merging for pull requests using GitHub Actions, AI-powered analysis, and security scanning.

### How It Works

```
PR Created/Updated
    ↓
Code Quality Checks (ESLint, Tests, Coverage)
    ↓
Security Scan (npm audit, secrets, injection)
    ↓
AI Code Review (analyze changes, score quality)
    ↓
Auto-Approval (if all conditions met)
    ↓
Auto-Merge (squash/merge/rebase)
    ↓
Notifications (Slack/Discord)
```

## Features

### ✅ Automated Code Quality Checks
- **ESLint**: Ensures code style consistency
- **Unit Tests**: All tests must pass
- **Code Coverage**: Minimum 80% coverage required

### 🔒 Security Scanning
- **NPM Audit**: Checks for known vulnerabilities
- **Secret Detection**: Scans for hardcoded credentials
- **Injection Prevention**: Detects command/SQL injection patterns

### 🤖 AI Code Review
- **Code Quality Analysis** (30% weight)
  - Naming conventions
  - Code complexity
  - Duplication
  - Error handling

- **Security Review** (40% weight)
  - Injection vulnerabilities
  - Hardcoded secrets
  - Authentication issues
  - Authorization issues

- **Performance Check** (15% weight)
  - Algorithm efficiency
  - Memory leaks
  - N+1 queries

- **Maintainability** (15% weight)
  - Documentation
  - Test coverage
  - Modularity
  - Readability

### 🔀 Smart Merging
- **Multiple Strategies**: Squash (default), merge, rebase
- **Label-Based**: Control merge strategy with labels
- **Safety Checks**: Prevents merging conflicted or broken PRs
- **Auto-Delete**: Removes merged branches automatically

### 📢 Notifications
- **Slack Integration**: Real-time merge notifications
- **Discord Support**: Webhook-based alerts
- **Rich Context**: Includes PR details, author, merge SHA

## Setup

### 1. Prerequisites

- GitHub repository with Actions enabled
- Node.js 20+ in CI environment
- GitHub token with `contents:write` and `pull-requests:write` permissions

### 2. Repository Secrets

Add these secrets to your GitHub repository:

```bash
# Required
gh secret set GITHUB_TOKEN --body "ghp_..."

# Optional - for AI review
gh secret set OPENAI_API_KEY --body "sk-..."

# Optional - for notifications
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/services/..."
gh secret set DISCORD_WEBHOOK --body "https://discord.com/api/webhooks/..."
```

To set secrets:
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add name and value
4. Click **Add secret**

### 3. Enable GitHub Actions

Ensure workflows are enabled in **Settings** → **Actions** → **General**:
- ✅ Allow all actions and reusable workflows
- ✅ Read and write permissions for GITHUB_TOKEN

### 4. Branch Protection Rules (Recommended)

Protect your `main` branch:
1. Go to **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass
   - ✅ Require branches to be up to date
   - ✅ Include administrators
4. Add required status checks:
   - `Code Quality Checks`
   - `Security Scan`
   - `AI Code Review`

## Configuration

### `.github/auto-review-config.yml`

Main configuration file. Key sections:

#### Auto-Merge Settings

```yaml
auto_merge:
  enabled: true
  strategy: squash  # squash, merge, or rebase
  
  conditions:
    all_checks_passed: true
    no_conflicts: true
    min_approvals: 1
    ai_review_score: 8
    security_scan_clean: true
    coverage_threshold: 80
  
  allowed_authors:
    - jawsbaek
    - dependabot[bot]
```

#### Review Criteria Weights

Customize scoring weights (must sum to 100):

```yaml
review:
  criteria:
    code_quality:
      weight: 30
    security:
      weight: 40
    performance:
      weight: 15
    maintainability:
      weight: 15
```

#### Security Settings

```yaml
security:
  blocking_severities:
    - critical
    - high
  npm_audit_level: moderate
```

### `.github/CODEOWNERS`

Define code owners who are auto-requested as reviewers:

```
# Workflows
/.github/workflows/    @jawsbaek

# Security files
/scripts/security-scanner.js    @jawsbaek

# All other files
*    @jawsbaek
```

## Usage

### Creating a PR

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make changes and commit**:
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin feature/my-new-feature
   ```

3. **Open a PR** on GitHub

4. **Wait for automated checks**:
   - Code quality checks run
   - Security scan completes
   - AI review analyzes changes
   - Auto-approval if all conditions met

### Labels

Use labels to control merge behavior:

- **`auto-merge`**: Enables auto-merge (added automatically if approved)
- **`hold`**: Prevents auto-merge (add manually to pause)
- **`merge-squash`**: Force squash merge
- **`merge-commit`**: Force merge commit
- **`merge-rebase`**: Force rebase merge

#### Examples

**Enable auto-merge manually:**
```bash
gh pr edit <PR-NUMBER> --add-label "auto-merge"
```

**Prevent auto-merge:**
```bash
gh pr edit <PR-NUMBER> --add-label "hold"
```

**Force rebase merge:**
```bash
gh pr edit <PR-NUMBER> --add-label "merge-rebase"
```

### Manual Override

To prevent auto-merge even when conditions are met:

1. Add the `hold` label to the PR
2. Or comment `/hold` on the PR
3. Auto-merge will be paused until label is removed

## Workflows

### `pr-auto-review.yml`

Runs on: `pull_request` events (opened, synchronize, reopened, labeled)

**Jobs:**
1. **code-quality**: ESLint, tests, coverage
2. **security-scan**: npm audit, secrets, injection
3. **ai-code-review**: AI-powered analysis
4. **auto-approve**: Approve if all checks pass

### `pr-auto-merge.yml`

Runs on: `pull_request` (labeled, unlabeled), `pull_request_review`, `check_suite`, `status`

**Jobs:**
1. **auto-merge**: Merges PR if:
   - Has `auto-merge` label
   - No `hold` label
   - All checks passed
   - No conflicts
   - Approved by code owners

## Security

### Hardcoded Secrets Detection

The scanner detects common patterns:
- API keys
- Passwords
- Private keys
- AWS credentials
- GitHub tokens
- JWT tokens
- Database URLs

**Best practices:**
- Use environment variables
- Never commit `.env` files
- Use GitHub Secrets for CI/CD
- Rotate credentials immediately if leaked

### Command Injection Prevention

The scanner detects dangerous patterns:
- `eval()` usage
- String concatenation in `exec()`
- SQL string concatenation
- `innerHTML` with dynamic content

**Safe alternatives:**
```javascript
// ❌ Unsafe
exec(`git clone ${userInput}`)

// ✅ Safe
execFile('git', ['clone', userInput])
```

### Allowlist Management

Only approved authors can trigger auto-merge. Update in config:

```yaml
auto_merge:
  allowed_authors:
    - your-username
    - dependabot[bot]
    - trusted-contributor
```

## Troubleshooting

### PR Not Auto-Merging

**Check:**
1. Does the PR have the `auto-merge` label?
2. Does it have the `hold` label? (remove it)
3. Are all checks passing?
4. Is the author in `allowed_authors`?
5. Are there merge conflicts?

**View logs:**
```bash
gh run list --workflow=pr-auto-merge.yml
gh run view <RUN-ID> --log
```

### AI Review Score Too Low

**Common reasons:**
- Code complexity issues
- Missing documentation
- Security concerns
- Test coverage below threshold

**Fix:**
- Address issues mentioned in review comments
- Improve code quality
- Add tests and documentation
- Remove security vulnerabilities

### Checks Failing

**ESLint failure:**
```bash
npm run lint
npm run lint -- --fix  # Auto-fix issues
```

**Test failure:**
```bash
npm test
npm test -- --coverage  # Check coverage
```

**Security scan failure:**
```bash
node scripts/security-scanner.js
```

### Webhook Notifications Not Sending

**Check:**
1. Are webhook secrets set correctly?
2. Are URLs valid?
3. Check workflow logs for errors

**Test webhooks:**
```bash
curl -X POST $SLACK_WEBHOOK -d '{"text":"Test message"}'
curl -X POST $DISCORD_WEBHOOK -d '{"content":"Test message"}'
```

## Advanced Usage

### Custom Review Criteria

Modify `scripts/pr-reviewer.js` to add custom checks:

```javascript
checkCustomRule(content, file) {
  const issues = [];
  
  // Your custom logic here
  if (content.includes('deprecated-function')) {
    issues.push({
      file,
      line: 1,
      severity: 'warning',
      message: 'Use of deprecated function',
      category: 'code_quality'
    });
  }
  
  return issues;
}
```

### OpenClaw Integration

To use OpenClaw for AI review instead of direct API calls:

1. Update config:
   ```yaml
   openclaw:
     enabled: true
     review_agent: "pr-reviewer"
   ```

2. Modify workflow to call OpenClaw CLI:
   ```yaml
   - name: AI Code Review
     run: |
       openclaw agents spawn pr-reviewer \
         --task "Review PR #${{ github.event.pull_request.number }}"
   ```

### Rollback on Failure

Enable auto-revert if issues detected after merge:

```yaml
rollback:
  enabled: true
  watch_period: 60  # minutes
  triggers:
    - build_failure
    - test_failure
```

## Best Practices

1. **Small PRs**: Keep PRs focused and under 500 lines
2. **Good Titles**: Use descriptive PR titles
3. **Documentation**: Update docs with code changes
4. **Tests**: Add tests for new features
5. **Review First**: Review AI feedback before requesting human review
6. **Address Issues**: Fix all critical/high severity issues
7. **Clean History**: Squash commits for cleaner history

## Support

For issues or questions:
- Check workflow logs in GitHub Actions
- Review this documentation
- Open an issue in the repository
- Contact: jawsbaek

---

**Last Updated:** 2026-02-02
**Version:** 1.0.0
