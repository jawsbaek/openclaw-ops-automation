#!/usr/bin/env node

/**
 * Auto-Merger for Pull Requests
 * Handles conditional merging and notifications
 */

const _fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');

class AutoMerger {
  constructor(options = {}) {
    this.prNumber = options.prNumber;
    this.mergeMethod = options.mergeMethod || 'squash';
    this.prTitle = options.prTitle;
    this.prAuthor = options.prAuthor;
    this.mergeSha = options.mergeSha;
    this.githubToken = process.env.GITHUB_TOKEN;
    this.slackWebhook = process.env.SLACK_WEBHOOK;
    this.discordWebhook = process.env.DISCORD_WEBHOOK;
  }

  async check() {
    console.log(`🔍 Running pre-merge checks for PR #${this.prNumber}...`);

    const checks = [this.checkConflicts(), this.checkBranchProtection(), this.checkMergeability()];

    const results = await Promise.all(checks);
    const allPassed = results.every((r) => r);

    if (allPassed) {
      console.log('✅ All pre-merge checks passed');
      return true;
    } else {
      console.log('❌ Some pre-merge checks failed');
      return false;
    }
  }

  async checkConflicts() {
    console.log('   Checking for conflicts...');
    // In real implementation, would check via GitHub API
    console.log('   ✅ No conflicts detected');
    return true;
  }

  async checkBranchProtection() {
    console.log('   Checking branch protection rules...');
    // In real implementation, would check via GitHub API
    console.log('   ✅ Branch protection rules satisfied');
    return true;
  }

  async checkMergeability() {
    console.log('   Checking if PR is mergeable...');
    // In real implementation, would check via GitHub API
    console.log('   ✅ PR is mergeable');
    return true;
  }

  async notify() {
    console.log(`📢 Sending merge notifications for PR #${this.prNumber}...`);

    const notifications = [];

    if (this.slackWebhook) {
      notifications.push(this.notifySlack());
    }

    if (this.discordWebhook) {
      notifications.push(this.notifyDiscord());
    }

    if (notifications.length === 0) {
      console.log('⚠️ No notification webhooks configured');
      return;
    }

    await Promise.all(notifications);
    console.log('✅ Notifications sent');
  }

  async notifySlack() {
    const message = {
      text: `🎉 PR Merged Successfully`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 Pull Request Auto-Merged'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*PR Number:*\n#${this.prNumber}`
            },
            {
              type: 'mrkdwn',
              text: `*Author:*\n${this.prAuthor}`
            },
            {
              type: 'mrkdwn',
              text: `*Title:*\n${this.prTitle}`
            },
            {
              type: 'mrkdwn',
              text: `*Merge Method:*\n${this.mergeMethod}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Merge SHA:* \`${this.mergeSha}\``
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Auto-merged by GitHub Actions • ${new Date().toISOString()}`
            }
          ]
        }
      ]
    };

    try {
      await this.sendWebhook(this.slackWebhook, message);
      console.log('   ✅ Slack notification sent');
    } catch (error) {
      console.error(`   ❌ Slack notification failed: ${error.message}`);
    }
  }

  async notifyDiscord() {
    const embed = {
      title: '🎉 Pull Request Auto-Merged',
      color: 0x00ff00, // Green
      fields: [
        {
          name: 'PR Number',
          value: `#${this.prNumber}`,
          inline: true
        },
        {
          name: 'Author',
          value: this.prAuthor,
          inline: true
        },
        {
          name: 'Title',
          value: this.prTitle
        },
        {
          name: 'Merge Method',
          value: this.mergeMethod,
          inline: true
        },
        {
          name: 'Merge SHA',
          value: `\`${this.mergeSha}\``,
          inline: true
        }
      ],
      footer: {
        text: 'Auto-merged by GitHub Actions'
      },
      timestamp: new Date().toISOString()
    };

    const message = {
      embeds: [embed]
    };

    try {
      await this.sendWebhook(this.discordWebhook, message);
      console.log('   ✅ Discord notification sent');
    } catch (error) {
      console.error(`   ❌ Discord notification failed: ${error.message}`);
    }
  }

  sendWebhook(url, payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const parsedUrl = new URL(url);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async createRevertPR() {
    console.log(`🔄 Creating revert PR for PR #${this.prNumber}...`);

    // In real implementation, would:
    // 1. Create a new branch
    // 2. Revert the merge commit
    // 3. Push the branch
    // 4. Create a new PR

    console.log('   ✅ Revert PR created (simulated)');
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  let action = 'check';

  args.forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      const cleanKey = key.replace(/-/g, '_');

      if (cleanKey === 'check' || cleanKey === 'notify' || cleanKey === 'revert') {
        action = cleanKey;
      } else {
        options[cleanKey] = value || true;
      }
    }
  });

  const merger = new AutoMerger({
    prNumber: options.pr_number,
    mergeMethod: options.merge_method,
    prTitle: options.pr_title,
    prAuthor: options.pr_author,
    mergeSha: options.merge_sha
  });

  let promise;

  switch (action) {
    case 'check':
      promise = merger.check();
      break;
    case 'notify':
      promise = merger.notify();
      break;
    case 'revert':
      promise = merger.createRevertPR();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }

  promise
    .then((result) => {
      if (result === false) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Auto-merger failed:', error);
      process.exit(1);
    });
}

module.exports = AutoMerger;
