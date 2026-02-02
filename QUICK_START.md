# 🚀 PR 자동화 시스템 - 빠른 시작

## 1분 설정 가이드

### 1. GitHub Secrets 설정 (필수)

```bash
gh secret set OPENAI_API_KEY --body "sk-your-openai-key"
```

### 2. 설정 스크립트 실행

```bash
cd /tmp/openclaw-ops-automation
./scripts/setup-pr-automation.sh
```

### 3. 설정 파일 수정

```bash
vim .github/auto-review-config.yml
```

`allowed_authors`에 본인 GitHub 사용자명 추가:

```yaml
allowed_authors:
  - jawsbaek      # 본인 사용자명으로 변경
  - dependabot[bot]
```

### 4. 테스트 PR 확인

https://github.com/jawsbaek/openclaw-ops-automation/pull/2

### 5. 브랜치 보호 활성화 (권장)

Settings → Branches → Add rule for `main`

---

## 작동 확인

```bash
# 워크플로우 상태 확인
gh run list --limit 5

# PR 상태 확인
gh pr view 2

# 보안 스캔 테스트
node scripts/security-scanner.js all
```

---

## 문제 해결

**워크플로우가 실행되지 않음?**
→ Settings → Actions → "Allow all actions" 확인

**AI 리뷰 실패?**
→ `gh secret set OPENAI_API_KEY --body "sk-..."`

**자동 머지 안됨?**
→ `.github/auto-review-config.yml`에서 `allowed_authors` 확인

---

## 주요 파일

- 📖 **완전한 가이드**: `docs/pr-automation-guide.md`
- 📋 **구현 요약**: `PR_AUTOMATION_SUMMARY.md`
- ⚙️ **설정**: `.github/auto-review-config.yml`
- 🔧 **설정 스크립트**: `scripts/setup-pr-automation.sh`

---

## 사용법

### PR 생성하면 자동으로:

1. ✅ 코드 품질 검사 (ESLint, 테스트, 커버리지)
2. 🔒 보안 스캔 (시크릿, 인젝션)
3. 🤖 AI 리뷰 (8/10 점 이상 자동 승인)
4. 🔀 자동 머지 (조건 충족 시)
5. 📢 알림 (Slack/Discord)

### 라벨로 제어:

- `auto-merge`: 자동 머지 활성화
- `hold`: 자동 머지 방지
- `merge-squash`: Squash 머지
- `merge-rebase`: Rebase 머지

---

**더 자세한 내용**: `docs/pr-automation-guide.md`
