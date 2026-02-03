/**
 * @fileoverview Tests for AutoHeal Agent
 */

import { vi } from 'vitest';

// Mock child_process exec
const mockExecAsync = vi.fn();

// Mock dependencies before imports
vi.mock('node:child_process', () => ({
  exec: vi.fn() // This won't be used directly
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync
}));

const mockLoadAutoHealPlaybooks = vi.fn();
const mockSaveIncident = vi.fn();
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../lib/config-loader.js', () => ({
  loadAutoHealPlaybooks: mockLoadAutoHealPlaybooks
}));

vi.mock('../../lib/file-utils.js', () => ({
  saveIncident: mockSaveIncident
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => mockLogger
}));

// Import after mocking
const { heal } = await import('../../workers/autoheal.js');

describe('AutoHeal Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveIncident.mockReturnValue('/path/to/incident.md');
    mockExecAsync.mockReset();
  });

  describe('heal() - Main Function', () => {
    it('should successfully execute healing playbook with valid scenario', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete', 'docker system prune -f']
        }
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'deleted 10 files', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'pruned containers', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(true);
      expect(result.scenario).toBe('disk_space_low');
      expect(result.playbook).toBe('disk_space_low');
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].success).toBe(true);
      expect(result.actions[1].success).toBe(true);
      expect(mockSaveIncident).toHaveBeenCalled();
    });

    it('should handle invalid scenario name', async () => {
      const result = await heal('unknown_scenario', {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid scenario name');
    });

    it('should handle playbook not found for valid scenario', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({});

      const result = await heal('disk_space_low', {});

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });

    it('should stop execution on first action failure', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete', 'docker system prune -f']
        }
      });

      const error = new Error('Permission denied');
      error.stdout = '';
      error.stderr = 'Permission denied';
      mockExecAsync.mockRejectedValueOnce(error);

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].success).toBe(false);
    });

    it('should evaluate playbook conditions correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage > 90',
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      // Condition met
      const result1 = await heal('disk_space_low', { disk_usage: 95 });
      expect(result1.success).toBe(true);

      // Condition not met
      const result2 = await heal('disk_space_low', { disk_usage: 85 });
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('No applicable playbook found');
    });

    it('should include reportPath in result', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });
      mockSaveIncident.mockReturnValue('/path/to/report.md');

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.reportPath).toBe('/path/to/report.md');
    });

    it('should generate unique incident IDs', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      const result1 = await heal('disk_space_low', { disk_usage: 95 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result2 = await heal('disk_space_low', { disk_usage: 95 });

      expect(result1.incidentId).not.toBe(result2.incidentId);
      expect(result1.incidentId).toMatch(/^heal-\d+$/);
    });
  });

  describe('Context Validation', () => {
    it('should reject null context', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('disk_space_low', null);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid context data');
    });

    it('should reject non-object context', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('disk_space_low', 'invalid');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid context data');
    });

    it('should accept valid numeric context values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "disk at {disk_usage}%"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'disk at 95%', stderr: '' });

      const result = await heal('disk_space_low', {
        disk_usage: 95,
        memory_usage: 80
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-numeric values for numeric fields', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('disk_space_low', {
        disk_usage: 'invalid'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('must be a finite number');
    });

    it('should reject out-of-range numeric values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('disk_space_low', {
        disk_usage: 2000000
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('value out of range');
    });

    it('should reject negative numeric values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('disk_space_low', {
        disk_usage: -10
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('value out of range');
    });

    it('should accept valid string context values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "restarting {process_name}"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'restarting nginx', stderr: '' });

      const result = await heal('process_down', {
        process_name: 'nginx'
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-string values for process_name', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('process_down', {
        process_name: 123
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('must be a string');
    });

    it('should reject process_name with invalid characters', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('process_down', {
        process_name: 'nginx; rm -rf /'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('invalid characters');
    });

    it('should reject process_name exceeding max length', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('process_down', {
        process_name: 'a'.repeat(101)
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('exceeds maximum length');
    });

    it('should accept valid process_status enum values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "{process_status}"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'crashed', stderr: '' });

      const result = await heal('process_down', {
        process_status: 'crashed'
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid process_status values', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['echo "test"']
        }
      });

      const result = await heal('process_down', {
        process_status: 'invalid_status'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('has invalid value');
    });

    it('should handle action execution with stderr output', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({
        stdout: 'deleted files',
        stderr: 'warning: some files skipped'
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(true);
      expect(result.actions[0].stderr).toBe('warning: some files skipped');
    });

    it('should handle execution timeout errors', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['sleep 60']
        }
      });

      const timeoutError = new Error('Command failed');
      timeoutError.stdout = '';
      timeoutError.stderr = 'timeout';
      mockExecAsync.mockRejectedValue(timeoutError);

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toBe('Command failed');
    });
  });

  describe('Playbook Selection', () => {
    it('should select playbook by direct scenario match', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        },
        memory_leak: {
          actions: ['systemctl restart app']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('memory_leak', {});

      expect(result.playbook).toBe('memory_leak');
    });

    it('should handle when no playbook matches condition', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage > 90',
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 80 });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });
  });

  describe('Condition Evaluation', () => {
    it('should evaluate > operator correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage > 90',
          actions: ['echo "cleanup"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 95 });
      expect(result.success).toBe(true);
    });

    it('should evaluate < operator correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        api_slow: {
          condition: 'api_latency_ms < 100',
          actions: ['echo "fast"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('api_slow', { api_latency_ms: 50 });
      expect(result.success).toBe(true);
    });

    it('should evaluate >= operator correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage >= 90',
          actions: ['echo "cleanup"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 90 });
      expect(result.success).toBe(true);
    });

    it('should evaluate <= operator correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        ssl_expiring: {
          condition: 'ssl_expires_in_days <= 30',
          actions: ['certbot renew --quiet']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('ssl_expiring', { ssl_expires_in_days: 30 });
      expect(result.success).toBe(true);
    });

    it('should evaluate == operator correctly', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage == 100',
          actions: ['echo "full"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 100 });
      expect(result.success).toBe(true);
    });
  });

  describe('Scenario Validation', () => {
    it('should reject non-string scenario', async () => {
      const result = await heal(123, {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid scenario name');
    });

    it('should reject empty scenario string', async () => {
      const result = await heal('', {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid scenario name');
    });

    it('should reject scenario exceeding max length', async () => {
      const longScenario = 'a'.repeat(51);
      const result = await heal(longScenario, {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid scenario name');
    });

    it('should reject scenario not in allowlist', async () => {
      const result = await heal('valid_format_but_not_allowed', {});

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid scenario name');
    });

    it('should accept all allowed scenarios', async () => {
      const allowedScenarios = ['disk_space_low', 'process_down', 'memory_leak', 'api_slow', 'ssl_expiring'];

      mockLoadAutoHealPlaybooks.mockReturnValue({});

      for (const scenario of allowedScenarios) {
        const result = await heal(scenario, {});
        expect(result.reason).not.toContain('Invalid scenario name');
      }
    });
  });

  describe('Command Sanitization', () => {
    it('should reject command with dangerous shell metacharacters', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo test; rm -rf /']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command with pipe operator', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['cat /etc/passwd | grep root']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command with command substitution', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo $(whoami)']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command with variable expansion', async () => {
      const dangerousCommand = 'echo $' + '{HOME}';
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: [dangerousCommand]
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command with backticks', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo `whoami`']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command with redirection', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo test >> /tmp/file']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject non-whitelisted command with &&', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo test && echo danger']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject non-whitelisted command with ||', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['false || echo fallback']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('dangerous pattern');
    });

    it('should reject command exceeding max length', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['a'.repeat(501)]
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('exceeds maximum length');
    });

    it('should reject non-string command', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: [123]
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.actions[0].error).toContain('must be a string');
    });

    it('should allow whitelisted playbook commands with &&', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ["pkill -f 'nginx' && systemctl start nginx"]
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'restarted', stderr: '' });

      const result = await heal('process_down', {});

      expect(result.success).toBe(true);
    });

    it('should allow certbot renew command', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        ssl_expiring: {
          actions: ['certbot renew --quiet']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'renewed', stderr: '' });

      const result = await heal('ssl_expiring', {});

      expect(result.success).toBe(true);
    });

    it('should allow nginx reload command', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        ssl_expiring: {
          actions: ['nginx -s reload']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'reloaded', stderr: '' });

      const result = await heal('ssl_expiring', {});

      expect(result.success).toBe(true);
    });

    it('should substitute context variables in commands', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        process_down: {
          actions: ['systemctl restart {process_name}']
        }
      });

      mockExecAsync.mockImplementation(async (cmd) => {
        expect(cmd).toBe('systemctl restart nginx');
        return { stdout: 'restarted', stderr: '' };
      });

      const result = await heal('process_down', { process_name: 'nginx' });

      expect(result.success).toBe(true);
    });
  });

  describe('Incident Report Generation', () => {
    it('should generate report with success status', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'deleted 10 files', stderr: '' });

      let savedReport = '';
      mockSaveIncident.mockImplementation((_id, report) => {
        savedReport = report;
        return '/path/to/report.md';
      });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(savedReport).toContain('# Incident Report:');
      expect(savedReport).toContain('**Status:** ✅ Resolved');
      expect(savedReport).toContain('disk_usage');
      expect(savedReport).toContain('deleted 10 files');
    });

    it('should generate report with failure status', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockRejectedValue(new Error('Permission denied'));

      let savedReport = '';
      mockSaveIncident.mockImplementation((_id, report) => {
        savedReport = report;
        return '/path/to/report.md';
      });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(savedReport).toContain('**Status:** ❌ Failed');
      expect(savedReport).toContain('Permission denied');
      expect(savedReport).toContain('Manual intervention may be required');
    });

    it('should include stderr in report', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({
        stdout: 'deleted files',
        stderr: 'warning: permission denied on /tmp/protected'
      });

      let savedReport = '';
      mockSaveIncident.mockImplementation((_id, report) => {
        savedReport = report;
        return '/path/to/report.md';
      });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(savedReport).toContain('**Stderr:**');
      expect(savedReport).toContain('warning: permission denied');
    });

    it('should include multiple actions in report', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete', 'docker system prune -f']
        }
      });

      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'deleted 10 files', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'pruned containers', stderr: '' });

      let savedReport = '';
      mockSaveIncident.mockImplementation((_id, report) => {
        savedReport = report;
        return '/path/to/report.md';
      });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(savedReport).toContain('### 1. ✅');
      expect(savedReport).toContain('### 2. ✅');
      expect(savedReport).toContain('deleted 10 files');
      expect(savedReport).toContain('pruned containers');
    });
  });

  describe('Playbook Condition Matching', () => {
    it('should find playbook by matching condition when no direct scenario match', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        other_scenario: {
          condition: 'disk_usage > 90',
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(true);
      expect(result.playbook).toBe('other_scenario');
    });

    it('should use first matching condition playbook', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        playbook_a: {
          condition: 'disk_usage > 90',
          actions: ['echo "a"']
        },
        playbook_b: {
          condition: 'disk_usage > 80',
          actions: ['echo "b"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(true);
      expect(result.playbook).toBe('playbook_a');
    });
  });

  describe('Unknown Operator Handling', () => {
    it('should return false for operator not matching regex pattern', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage <> 90',
          actions: ['echo "cleanup"']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });

    it('should return false for unknown operator like !=', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'disk_usage != 90',
          actions: ['echo "cleanup"']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });

    it('should handle malformed condition', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'invalid condition format',
          actions: ['echo "cleanup"']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });

    it('should handle missing context variable in condition', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          condition: 'memory_usage > 90',
          actions: ['echo "cleanup"']
        }
      });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No applicable playbook found');
    });
  });

  describe('Unknown Context Keys', () => {
    it('should ignore unknown context keys and warn', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      const result = await heal('disk_space_low', {
        disk_usage: 95,
        unknown_key: 'value'
      });

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Validation: ignoring unknown context key',
        expect.objectContaining({ key: 'unknown_key' })
      );
    });

    it('should process valid keys and skip unknown keys', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['echo "disk at {disk_usage}%"']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'disk at 95%', stderr: '' });

      const result = await heal('disk_space_low', {
        disk_usage: 95,
        invalid_key1: 'ignored',
        invalid_key2: 123
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context object', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      const result = await heal('disk_space_low', {});

      expect(result.success).toBe(true);
    });

    it('should handle playbook with empty actions array', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: []
        }
      });

      const result = await heal('disk_space_low', {});

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
    });

    it('should track execution duration', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ stdout: 'ok', stderr: '' });
            }, 50);
          })
      );

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.duration).toBeGreaterThanOrEqual(40);
      expect(typeof result.duration).toBe('number');
    });

    it('should include timestamp in result', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      const result = await heal('disk_space_low', { disk_usage: 95 });

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Logging', () => {
    it('should log healing start', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting AutoHeal',
        expect.objectContaining({
          scenario: 'disk_space_low'
        })
      );
    });

    it('should log playbook execution', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing playbook',
        expect.objectContaining({
          playbook: 'disk_space_low',
          actions: 1
        })
      );
    });

    it('should log action execution', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      await heal('disk_space_low', { disk_usage: 95 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing healing action',
        expect.objectContaining({
          command: 'find /tmp -type f -mtime +7 -delete'
        })
      );
    });

    it('should log completion', async () => {
      mockLoadAutoHealPlaybooks.mockReturnValue({
        disk_space_low: {
          actions: ['find /tmp -type f -mtime +7 -delete']
        }
      });

      mockExecAsync.mockResolvedValue({ stdout: 'cleaned', stderr: '' });

      await heal('disk_space_low', { disk_usage: 95 });

      const completionCalls = mockLogger.info.mock.calls.filter((call) => call[0] === 'AutoHeal completed');
      expect(completionCalls.length).toBeGreaterThan(0);
      expect(completionCalls[0][1]).toMatchObject({
        success: true
      });
    });
  });
});
