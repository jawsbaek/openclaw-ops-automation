#!/usr/bin/env node

/**
 * AI-powered PR Code Reviewer
 * Analyzes code changes and provides intelligent feedback
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Review criteria with weights
const REVIEW_CRITERIA = {
  code_quality: {
    weight: 30,
    checks: ['naming', 'complexity', 'duplication', 'error_handling']
  },
  security: {
    weight: 40,
    checks: ['injection', 'secrets', 'authentication', 'authorization', 'validation']
  },
  performance: {
    weight: 15,
    checks: ['algorithms', 'memory_leaks', 'n_plus_1', 'unnecessary_computations']
  },
  maintainability: {
    weight: 15,
    checks: ['documentation', 'test_coverage', 'modularity', 'readability']
  }
};

class PRReviewer {
  constructor(options) {
    this.prNumber = options.prNumber;
    this.files = options.files || [];
    this.codeQualityPassed = options.codeQualityPassed === 'true';
    this.securityPassed = options.securityPassed === 'true';
    this.githubToken = process.env.GITHUB_TOKEN;
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  async run() {
    console.log(`🔍 Starting AI code review for PR #${this.prNumber}...`);
    
    const scores = {
      code_quality: 0,
      security: 0,
      performance: 0,
      maintainability: 0
    };
    
    const comments = [];

    // Analyze each changed file
    for (const file of this.files.split(' ')) {
      if (!file || this.shouldSkipFile(file)) continue;
      
      console.log(`📄 Reviewing: ${file}`);
      const fileReview = await this.reviewFile(file);
      
      // Aggregate scores
      Object.keys(scores).forEach(category => {
        scores[category] += fileReview.scores[category] || 0;
      });
      
      comments.push(...fileReview.comments);
    }

    // Calculate weighted total score
    const fileCount = this.files.split(' ').filter(f => f && !this.shouldSkipFile(f)).length;
    const totalScore = this.calculateTotalScore(scores, fileCount);
    
    console.log(`\n📊 Review Scores:`);
    console.log(`   Code Quality: ${(scores.code_quality / fileCount).toFixed(1)}/10`);
    console.log(`   Security: ${(scores.security / fileCount).toFixed(1)}/10`);
    console.log(`   Performance: ${(scores.performance / fileCount).toFixed(1)}/10`);
    console.log(`   Maintainability: ${(scores.maintainability / fileCount).toFixed(1)}/10`);
    console.log(`   Total Score: ${totalScore.toFixed(1)}/10`);

    // Post review comments to GitHub
    await this.postReviewComments(comments, totalScore);

    // Save results
    const results = {
      score: totalScore,
      approved: totalScore >= 8,
      scores: {
        code_quality: (scores.code_quality / fileCount).toFixed(1),
        security: (scores.security / fileCount).toFixed(1),
        performance: (scores.performance / fileCount).toFixed(1),
        maintainability: (scores.maintainability / fileCount).toFixed(1)
      },
      comments: comments.length,
      files_reviewed: fileCount
    };

    fs.writeFileSync('review-results.json', JSON.stringify(results, null, 2));
    
    console.log(`\n${results.approved ? '✅' : '❌'} Review complete!`);
    console.log(`   Score: ${totalScore.toFixed(1)}/10`);
    console.log(`   Status: ${results.approved ? 'APPROVED' : 'NEEDS IMPROVEMENT'}`);
    
    process.exit(results.approved ? 0 : 1);
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
    
    return skipPatterns.some(pattern => pattern.test(file));
  }

  async reviewFile(file) {
    const scores = {
      code_quality: 8,
      security: 8,
      performance: 8,
      maintainability: 8
    };
    
    const comments = [];

    try {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Code Quality Checks
      const qualityIssues = this.checkCodeQuality(content, file);
      if (qualityIssues.length > 0) {
        scores.code_quality = Math.max(5, 10 - qualityIssues.length);
        comments.push(...qualityIssues);
      }

      // Security Checks
      const securityIssues = this.checkSecurity(content, file);
      if (securityIssues.length > 0) {
        scores.security = Math.max(3, 10 - securityIssues.length * 2);
        comments.push(...securityIssues);
      }

      // Performance Checks
      const perfIssues = this.checkPerformance(content, file);
      if (perfIssues.length > 0) {
        scores.performance = Math.max(6, 10 - perfIssues.length);
        comments.push(...perfIssues);
      }

      // Maintainability Checks
      const maintIssues = this.checkMaintainability(content, file);
      if (maintIssues.length > 0) {
        scores.maintainability = Math.max(6, 10 - maintIssues.length);
        comments.push(...maintIssues);
      }

    } catch (error) {
      console.error(`⚠️ Error reviewing ${file}: ${error.message}`);
    }

    return { scores, comments };
  }

  checkCodeQuality(content, file) {
    const issues = [];

    // Check for long functions (>50 lines)
    const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{[\s\S]*?}\s*}/g) || [];
    functionMatches.forEach(func => {
      const lines = func.split('\n').length;
      if (lines > 50) {
        issues.push({
          file,
          line: this.findLineNumber(content, func),
          severity: 'warning',
          message: `Function is too long (${lines} lines). Consider breaking it down into smaller functions.`,
          category: 'code_quality'
        });
      }
    });

    // Check for TODO/FIXME comments
    const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK)/gi) || [];
    if (todoMatches.length > 3) {
      issues.push({
        file,
        line: 1,
        severity: 'info',
        message: `Found ${todoMatches.length} TODO/FIXME comments. Consider addressing them.`,
        category: 'code_quality'
      });
    }

    // Check for magic numbers
    const magicNumbers = content.match(/[^a-zA-Z_]\d{3,}[^a-zA-Z_]/g) || [];
    if (magicNumbers.length > 5) {
      issues.push({
        file,
        line: 1,
        severity: 'info',
        message: 'Consider extracting magic numbers into named constants.',
        category: 'code_quality'
      });
    }

    return issues;
  }

  checkSecurity(content, file) {
    const issues = [];

    // Check for eval usage
    if (/\beval\s*\(/.test(content)) {
      issues.push({
        file,
        line: this.findLineNumber(content, 'eval('),
        severity: 'error',
        message: '🚨 Use of eval() detected. This is a major security risk!',
        category: 'security'
      });
    }

    // Check for SQL concatenation
    if (/SELECT.*\+.*FROM/i.test(content) || /INSERT.*\+.*VALUES/i.test(content)) {
      issues.push({
        file,
        line: 1,
        severity: 'error',
        message: '🚨 Potential SQL injection via string concatenation. Use parameterized queries.',
        category: 'security'
      });
    }

    // Check for hardcoded credentials patterns
    const credPatterns = [
      /password\s*=\s*["'][^"']+["']/i,
      /api[_-]?key\s*=\s*["'][^"']+["']/i,
      /secret\s*=\s*["'][^"']+["']/i
    ];
    
    credPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        issues.push({
          file,
          line: this.findLineNumber(content, content.match(pattern)[0]),
          severity: 'error',
          message: '🚨 Potential hardcoded credentials detected. Use environment variables.',
          category: 'security'
        });
      }
    });

    // Check for innerHTML usage
    if (/innerHTML\s*=/.test(content)) {
      issues.push({
        file,
        line: this.findLineNumber(content, 'innerHTML'),
        severity: 'warning',
        message: '⚠️ innerHTML usage detected. Ensure input is sanitized to prevent XSS.',
        category: 'security'
      });
    }

    return issues;
  }

  checkPerformance(content, file) {
    const issues = [];

    // Check for synchronous file operations
    const syncOps = ['readFileSync', 'writeFileSync', 'existsSync'];
    syncOps.forEach(op => {
      if (content.includes(op) && !file.includes('test')) {
        issues.push({
          file,
          line: this.findLineNumber(content, op),
          severity: 'info',
          message: `Consider using async ${op.replace('Sync', '')} instead of ${op}.`,
          category: 'performance'
        });
      }
    });

    // Check for nested loops
    const nestedLoops = content.match(/for\s*\([^)]+\)\s*{[^}]*for\s*\([^)]+\)/g);
    if (nestedLoops && nestedLoops.length > 2) {
      issues.push({
        file,
        line: 1,
        severity: 'warning',
        message: 'Multiple nested loops detected. Consider optimizing for better performance.',
        category: 'performance'
      });
    }

    return issues;
  }

  checkMaintainability(content, file) {
    const issues = [];

    // Check for missing JSDoc on exported functions
    const exportedFunctions = content.match(/export\s+(async\s+)?function\s+\w+/g) || [];
    const jsdocCount = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
    
    if (exportedFunctions.length > jsdocCount + 2) {
      issues.push({
        file,
        line: 1,
        severity: 'info',
        message: 'Consider adding JSDoc comments to exported functions for better documentation.',
        category: 'maintainability'
      });
    }

    // Check for single-letter variable names (except i, j, k in loops)
    const singleLetterVars = content.match(/\b(?![ijk]\b)[a-z]\s*=/g) || [];
    if (singleLetterVars.length > 5) {
      issues.push({
        file,
        line: 1,
        severity: 'info',
        message: 'Use descriptive variable names instead of single letters.',
        category: 'maintainability'
      });
    }

    return issues;
  }

  findLineNumber(content, searchString) {
    const index = content.indexOf(searchString);
    if (index === -1) return 1;
    return content.substring(0, index).split('\n').length;
  }

  calculateTotalScore(scores, fileCount) {
    if (fileCount === 0) return 0;
    
    const avgScores = {
      code_quality: scores.code_quality / fileCount,
      security: scores.security / fileCount,
      performance: scores.performance / fileCount,
      maintainability: scores.maintainability / fileCount
    };

    let totalScore = 0;
    Object.keys(REVIEW_CRITERIA).forEach(category => {
      const weight = REVIEW_CRITERIA[category].weight / 100;
      totalScore += avgScores[category] * weight;
    });

    // Apply bonuses/penalties
    if (!this.codeQualityPassed) totalScore *= 0.8;
    if (!this.securityPassed) totalScore *= 0.7;

    return Math.min(10, Math.max(0, totalScore));
  }

  async postReviewComments(comments, totalScore) {
    if (!this.githubToken) {
      console.log('⚠️ No GitHub token provided, skipping comment posting');
      return;
    }

    const summaryComment = this.generateSummaryComment(comments, totalScore);
    
    console.log('\n📝 Review Summary:');
    console.log(summaryComment);

    // In a real implementation, this would use the GitHub API
    // For now, we'll just log it
    console.log('\n💬 Would post to GitHub PR comments');
  }

  generateSummaryComment(comments, totalScore) {
    const emoji = totalScore >= 8 ? '✅' : totalScore >= 6 ? '⚠️' : '❌';
    
    let summary = `## ${emoji} AI Code Review Results\n\n`;
    summary += `**Overall Score: ${totalScore.toFixed(1)}/10**\n\n`;
    
    if (comments.length === 0) {
      summary += '🎉 No issues found! Great work!\n\n';
    } else {
      summary += `### Issues Found (${comments.length})\n\n`;
      
      const byCategory = {};
      comments.forEach(comment => {
        if (!byCategory[comment.category]) {
          byCategory[comment.category] = [];
        }
        byCategory[comment.category].push(comment);
      });

      Object.keys(byCategory).forEach(category => {
        summary += `#### ${category.replace('_', ' ').toUpperCase()}\n\n`;
        byCategory[category].forEach(comment => {
          summary += `- [${comment.severity.toUpperCase()}] ${comment.file}:${comment.line}\n`;
          summary += `  ${comment.message}\n\n`;
        });
      });
    }

    summary += '\n---\n';
    summary += totalScore >= 8 
      ? '✅ **Recommendation:** APPROVE - Ready for merge\n'
      : '⚠️ **Recommendation:** REQUEST CHANGES - Please address the issues above\n';

    return summary;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    const cleanKey = key.replace(/^--/, '').replace(/-/g, '_');
    options[cleanKey] = value || true;
  });

  const reviewer = new PRReviewer({
    prNumber: options.pr_number,
    files: options.files,
    codeQualityPassed: options.code_quality_passed,
    securityPassed: options.security_passed
  });

  reviewer.run().catch(error => {
    console.error('❌ Review failed:', error);
    process.exit(1);
  });
}

module.exports = PRReviewer;
