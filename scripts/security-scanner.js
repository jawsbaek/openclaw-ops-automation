#!/usr/bin/env node

/**
 * Security Scanner for PR Reviews
 * Detects hardcoded secrets and command injection patterns
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Secret patterns to detect
const SECRET_PATTERNS = [
  {
    name: 'API Key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([a-zA-Z0-9_-]{20,})["']/gi,
    severity: 'high'
  },
  {
    name: 'Secret Key',
    pattern: /(?:secret[_-]?key|secretkey)\s*[:=]\s*["']([a-zA-Z0-9_-]{20,})["']/gi,
    severity: 'high'
  },
  {
    name: 'Password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi,
    severity: 'critical'
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    severity: 'critical'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical'
  },
  {
    name: 'AWS Secret Key',
    pattern: /(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?secret)\s*[:=]\s*["']([a-zA-Z0-9/+=]{40})["']/gi,
    severity: 'critical'
  },
  {
    name: 'GitHub Token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
    severity: 'critical'
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: 'high'
  },
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    severity: 'critical'
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g,
    severity: 'high'
  },
  {
    name: 'Database URL',
    pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^/]+/gi,
    severity: 'high'
  }
];

// Command injection patterns
const INJECTION_PATTERNS = [
  {
    name: 'eval()',
    pattern: /\beval\s*\(/g,
    severity: 'critical',
    message: 'eval() is dangerous and can execute arbitrary code'
  },
  {
    name: 'Function constructor',
    pattern: /new\s+Function\s*\(/g,
    severity: 'high',
    message: 'Function constructor can execute arbitrary code'
  },
  {
    name: 'child_process exec',
    pattern: /(?:exec|execSync)\s*\(\s*[`"']?[^)]*\$\{/g,
    severity: 'critical',
    message: 'Potential command injection via template literals in exec()'
  },
  {
    name: 'shell metacharacters',
    pattern: /exec(?:Sync)?\s*\([^)]*[;&|`]/g,
    severity: 'high',
    message: 'Potentially unsafe shell metacharacters in exec()'
  },
  {
    name: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=\s*[^;]*\$\{/g,
    severity: 'high',
    message: 'Potential XSS via innerHTML with template literals'
  },
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\{?\s*__html:\s*[^}]*\$\{/g,
    severity: 'high',
    message: 'Potential XSS via dangerouslySetInnerHTML with dynamic content'
  },
  {
    name: 'SQL string concatenation',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?(?:\+|\$\{)[\s\S]*?(?:FROM|INTO|SET|WHERE)/gi,
    severity: 'critical',
    message: 'Potential SQL injection via string concatenation'
  }
];

class SecurityScanner {
  constructor(scanType = 'all') {
    this.scanType = scanType;
    this.findings = [];
    this.fileCount = 0;
  }

  async scan() {
    console.log(`🔒 Starting security scan (${this.scanType})...`);

    const files = this.getChangedFiles();

    if (files.length === 0) {
      console.log('✅ No files to scan');
      return true;
    }

    console.log(`📂 Scanning ${files.length} files...`);

    for (const file of files) {
      if (this.shouldSkipFile(file)) continue;

      this.fileCount++;
      await this.scanFile(file);
    }

    return this.reportFindings();
  }

  getChangedFiles() {
    try {
      // Get changed files from git diff
      const output = execSync('git diff --name-only HEAD~1 HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      return output
        .trim()
        .split('\n')
        .filter((f) => f);
    } catch (_error) {
      // Fallback: scan all .js, .ts, .jsx, .tsx files
      console.log('⚠️ Could not get changed files, scanning all JS/TS files');
      return this.getAllSourceFiles();
    }
  }

  getAllSourceFiles() {
    const walk = (dir, fileList = []) => {
      const files = fs.readdirSync(dir);

      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          if (!this.shouldSkipDirectory(file)) {
            walk(filePath, fileList);
          }
        } else if (this.isSourceFile(file)) {
          fileList.push(filePath);
        }
      });

      return fileList;
    };

    return walk(process.cwd());
  }

  shouldSkipDirectory(dir) {
    const skipDirs = ['node_modules', 'dist', 'build', 'coverage', '.git'];
    return skipDirs.includes(dir);
  }

  shouldSkipFile(file) {
    const skipPatterns = [
      /\.min\.js$/,
      /\.map$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /node_modules\//,
      /dist\//,
      /build\//,
      /coverage\//
    ];

    return skipPatterns.some((pattern) => pattern.test(file));
  }

  isSourceFile(file) {
    return /\.(js|ts|jsx|tsx|json|yml|yaml|env)$/.test(file);
  }

  async scanFile(file) {
    try {
      if (!fs.existsSync(file)) {
        return;
      }

      const content = fs.readFileSync(file, 'utf-8');

      if (this.scanType === 'all' || this.scanType === 'secrets') {
        this.scanForSecrets(file, content);
      }

      if (this.scanType === 'all' || this.scanType === 'injection') {
        this.scanForInjection(file, content);
      }
    } catch (error) {
      console.error(`⚠️ Error scanning ${file}: ${error.message}`);
    }
  }

  scanForSecrets(file, content) {
    SECRET_PATTERNS.forEach(({ name, pattern, severity }) => {
      const matches = content.matchAll(new RegExp(pattern.source, pattern.flags));

      for (const match of matches) {
        // Check if it's in a comment or example
        const lineStart = content.lastIndexOf('\n', match.index);
        const line = content.substring(lineStart, content.indexOf('\n', match.index));

        // Skip if in comment or obvious example
        if (this.isLikelyFalsePositive(line, match[0])) {
          continue;
        }

        this.findings.push({
          type: 'secret',
          file,
          line: this.getLineNumber(content, match.index),
          severity,
          name,
          message: `Potential ${name} detected`,
          snippet: this.getSnippet(content, match.index)
        });
      }
    });
  }

  scanForInjection(file, content) {
    INJECTION_PATTERNS.forEach(({ name, pattern, severity, message }) => {
      const matches = content.matchAll(new RegExp(pattern.source, pattern.flags));

      for (const match of matches) {
        this.findings.push({
          type: 'injection',
          file,
          line: this.getLineNumber(content, match.index),
          severity,
          name,
          message,
          snippet: this.getSnippet(content, match.index)
        });
      }
    });
  }

  isLikelyFalsePositive(line, match) {
    // Check if in comment
    if (/\/\/|\/\*|\*|#/.test(line.trim().substring(0, 2))) {
      return true;
    }

    // Check if it's an example or placeholder
    const lowerMatch = match.toLowerCase();
    const placeholders = ['example', 'placeholder', 'your-', 'xxx', 'test', 'demo'];
    if (placeholders.some((p) => lowerMatch.includes(p))) {
      return true;
    }

    // Check if it's referencing environment variable
    if (/process\.env|env\./.test(line)) {
      return true;
    }

    return false;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  getSnippet(content, index, contextLines = 2) {
    const lines = content.split('\n');
    const lineNum = this.getLineNumber(content, index);
    const start = Math.max(0, lineNum - contextLines - 1);
    const end = Math.min(lines.length, lineNum + contextLines);

    return lines.slice(start, end).join('\n');
  }

  reportFindings() {
    console.log(`\n📊 Security Scan Results`);
    console.log(`   Files scanned: ${this.fileCount}`);
    console.log(`   Issues found: ${this.findings.length}`);

    if (this.findings.length === 0) {
      console.log('\n✅ No security issues detected!');
      return true;
    }

    // Group by severity
    const bySeverity = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    this.findings.forEach((finding) => {
      const severity = finding.severity || 'medium';
      if (bySeverity[severity]) {
        bySeverity[severity].push(finding);
      }
    });

    // Report critical and high severity issues
    ['critical', 'high'].forEach((severity) => {
      if (bySeverity[severity].length > 0) {
        console.log(`\n🚨 ${severity.toUpperCase()} Severity (${bySeverity[severity].length})`);
        bySeverity[severity].forEach((finding) => {
          console.log(`   ${finding.file}:${finding.line}`);
          console.log(`   ${finding.name}: ${finding.message}`);
          console.log('');
        });
      }
    });

    // Report medium and low severity issues
    ['medium', 'low'].forEach((severity) => {
      if (bySeverity[severity].length > 0) {
        console.log(`\n⚠️  ${severity.toUpperCase()} Severity (${bySeverity[severity].length})`);
        bySeverity[severity].forEach((finding) => {
          console.log(`   ${finding.file}:${finding.line} - ${finding.name}`);
        });
      }
    });

    // Fail if critical or high severity issues found
    const criticalCount = bySeverity.critical.length + bySeverity.high.length;

    if (criticalCount > 0) {
      console.log(`\n❌ Security scan FAILED: ${criticalCount} critical/high severity issues found`);
      return false;
    }

    console.log(`\n⚠️  Security scan PASSED with warnings`);
    return true;
  }
}

// CLI execution
if (require.main === module) {
  const scanType = process.argv[2] || 'all';

  const scanner = new SecurityScanner(scanType);

  scanner
    .scan()
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Security scan failed:', error);
      process.exit(1);
    });
}

module.exports = SecurityScanner;
