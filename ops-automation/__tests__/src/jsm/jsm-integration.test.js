import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockMethods = {
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  addComment: vi.fn(),
  transitionIssue: vi.fn(),
  updateIssue: vi.fn(),
  addLabels: vi.fn(),
  searchIssues: vi.fn()
};

vi.mock('node:fs', () => ({
  readFileSync: vi.fn()
}));

vi.mock('../../../lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../../src/jsm/jsm-client.js', () => ({
  JSMClient: class MockJSMClient {
    createRequest = mockMethods.createRequest;
    getRequest = mockMethods.getRequest;
    addComment = mockMethods.addComment;
    transitionIssue = mockMethods.transitionIssue;
    updateIssue = mockMethods.updateIssue;
    addLabels = mockMethods.addLabels;
    searchIssues = mockMethods.searchIssues;
  }
}));

const fs = await import('node:fs');
const {
  loadJSMConfig,
  resetJSMClient,
  createIncidentFromAlert,
  updateIncidentWithAutoHealResult,
  closeIncident,
  addIncidentComment,
  linkReportToIncident,
  clearIncidentCache
} = await import('../../../src/jsm/jsm-integration.js');

const mockConfig = {
  enabled: true,
  baseUrl: 'https://test.atlassian.net',
  serviceDeskId: '1',
  requestTypeId: '10001',
  auth: {
    type: 'basic',
    email: '${JSM_EMAIL}',
    apiToken: '${JSM_API_TOKEN}'
  },
  priorityMapping: {
    critical: 'Highest',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  },
  issueTypeMapping: {
    critical: 'Incident',
    high: 'Incident',
    medium: 'Service Request',
    low: 'Service Request'
  },
  transitionMapping: {
    resolved: '31',
    closed: '41'
  },
  customFields: {
    alertId: 'customfield_10100',
    autoHealAttempted: 'customfield_10101',
    autoHealResult: 'customfield_10102',
    affectedSystem: 'customfield_10103',
    metricValue: 'customfield_10104'
  },
  labels: {
    autoHealSuccess: 'autoheal-resolved',
    autoHealFailed: 'autoheal-failed',
    manualIntervention: 'manual-required'
  },
  deduplication: {
    enabled: true,
    windowMinutes: 30
  },
  rateLimiting: {
    maxRequestsPerMinute: 50
  }
};

describe('JSM Integration', () => {
  beforeEach(async () => {
    Object.keys(mockMethods).forEach((key) => {
      mockMethods[key].mockReset();
    });

    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    process.env.JSM_EMAIL = 'test@example.com';
    process.env.JSM_API_TOKEN = 'test-token';

    resetJSMClient();
    clearIncidentCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadJSMConfig', () => {
    test('should load config from file', async () => {
      resetJSMClient();

      const config = loadJSMConfig();

      expect(config.enabled).toBe(true);
      expect(config.baseUrl).toBe('https://test.atlassian.net');
    });

    test('should cache config after first load', async () => {
      resetJSMClient();

      const config1 = loadJSMConfig();
      const config2 = loadJSMConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('createIncidentFromAlert', () => {
    test('should create incident for alert', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-123',
        issueId: '10001'
      });

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });

      const alert = {
        id: 'alert-1234',
        metric: 'cpu_usage',
        value: 95,
        threshold: 90,
        level: 'critical',
        message: 'CPU usage is critical: 95 >= 90',
        timestamp: '2024-01-15T10:00:00Z',
        shouldAutoHeal: true
      };

      const result = await createIncidentFromAlert(alert);

      expect(result.issueKey).toBe('TEST-123');
      expect(result.deduplicated).toBe(false);
      expect(mockMethods.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.stringContaining('[CRITICAL]'),
          priority: 'Highest'
        })
      );
    });

    test('should deduplicate to existing incident', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({
        issues: [{ key: 'TEST-100' }]
      });
      mockMethods.addComment.mockResolvedValue({});

      const alert = {
        id: 'alert-5678',
        metric: 'memory_usage',
        value: 92,
        level: 'high',
        message: 'Memory usage high',
        timestamp: '2024-01-15T10:05:00Z'
      };

      const result = await createIncidentFromAlert(alert);

      expect(result.issueKey).toBe('TEST-100');
      expect(result.deduplicated).toBe(true);
      expect(mockMethods.createRequest).not.toHaveBeenCalled();
      expect(mockMethods.addComment).toHaveBeenCalled();
    });

    test('should return null when JSM is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      fs.readFileSync.mockReturnValue(JSON.stringify(disabledConfig));
      resetJSMClient();

      const result = await createIncidentFromAlert({ id: '1' });

      expect(result).toBeNull();

      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    });

    test('should include metadata in description', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-124',
        issueId: '10002'
      });

      const alert = {
        id: 'alert-meta',
        metric: 'disk_usage',
        value: 95,
        level: 'critical',
        message: 'Disk full',
        timestamp: '2024-01-15T10:00:00Z',
        metadata: { mount: '/data', device: 'sda1' }
      };

      await createIncidentFromAlert(alert);

      const callArgs = mockMethods.createRequest.mock.calls[0][0];
      expect(callArgs.description).toContain('/data');
      expect(callArgs.description).toContain('sda1');
    });

    test('should handle API error gracefully', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      mockMethods.createRequest.mockRejectedValue(new Error('API Error'));

      const result = await createIncidentFromAlert({
        id: 'alert-err',
        metric: 'test',
        level: 'high',
        message: 'Test',
        timestamp: new Date().toISOString()
      });

      expect(result).toBeNull();
    });
  });

  describe('updateIncidentWithAutoHealResult', () => {
    test('should update incident with successful AutoHeal result', async () => {
      resetJSMClient();

      mockMethods.addComment.mockResolvedValue({});
      mockMethods.updateIssue.mockResolvedValue({});
      mockMethods.addLabels.mockResolvedValue({});
      mockMethods.transitionIssue.mockResolvedValue({});

      const healResult = {
        incidentId: 'heal-12345',
        scenario: 'disk_space_low',
        playbook: 'disk_space_low',
        success: true,
        duration: 5000,
        timestamp: '2024-01-15T10:05:00Z',
        actions: [{ command: 'find /tmp -delete', success: true }],
        reportPath: '/incidents/heal-12345.md'
      };

      const result = await updateIncidentWithAutoHealResult('TEST-123', healResult);

      expect(result.issueKey).toBe('TEST-123');
      expect(result.updated).toBe(true);
      expect(mockMethods.addLabels).toHaveBeenCalledWith('TEST-123', ['autoheal-resolved']);
      expect(mockMethods.transitionIssue).toHaveBeenCalledWith(
        'TEST-123',
        '31',
        'Issue automatically resolved by AutoHeal'
      );
    });

    test('should update incident with failed AutoHeal result', async () => {
      resetJSMClient();

      mockMethods.addComment.mockResolvedValue({});
      mockMethods.updateIssue.mockResolvedValue({});
      mockMethods.addLabels.mockResolvedValue({});

      const healResult = {
        incidentId: 'heal-failed',
        scenario: 'process_down',
        playbook: 'process_down',
        success: false,
        duration: 3000,
        timestamp: '2024-01-15T10:05:00Z',
        actions: [{ command: 'systemctl restart app', success: false, error: 'Failed to restart' }]
      };

      const result = await updateIncidentWithAutoHealResult('TEST-124', healResult);

      expect(result.updated).toBe(true);
      expect(mockMethods.addLabels).toHaveBeenCalledWith('TEST-124', ['autoheal-failed', 'manual-required']);
      expect(mockMethods.transitionIssue).not.toHaveBeenCalled();
    });

    test('should return null when JSM is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      fs.readFileSync.mockReturnValue(JSON.stringify(disabledConfig));
      resetJSMClient();

      const result = await updateIncidentWithAutoHealResult('TEST-1', { success: true });

      expect(result).toBeNull();

      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    });
  });

  describe('closeIncident', () => {
    test('should close incident with transition', async () => {
      resetJSMClient();

      mockMethods.transitionIssue.mockResolvedValue({});

      const result = await closeIncident('TEST-123', 'Issue resolved');

      expect(result.issueKey).toBe('TEST-123');
      expect(result.closed).toBe(true);
      expect(mockMethods.transitionIssue).toHaveBeenCalledWith('TEST-123', '41', 'Incident closed: Issue resolved');
    });

    test('should handle close error gracefully', async () => {
      resetJSMClient();

      mockMethods.transitionIssue.mockRejectedValue(new Error('Transition failed'));

      const result = await closeIncident('TEST-123');

      expect(result).toBeNull();
    });
  });

  describe('addIncidentComment', () => {
    test('should add public comment', async () => {
      resetJSMClient();

      mockMethods.addComment.mockResolvedValue({});

      const result = await addIncidentComment('TEST-123', 'Investigation update', true);

      expect(result.issueKey).toBe('TEST-123');
      expect(result.commented).toBe(true);
      expect(mockMethods.addComment).toHaveBeenCalledWith('TEST-123', 'Investigation update', true);
    });

    test('should add internal comment', async () => {
      resetJSMClient();

      mockMethods.addComment.mockResolvedValue({});

      await addIncidentComment('TEST-123', 'Internal note', false);

      expect(mockMethods.addComment).toHaveBeenCalledWith('TEST-123', 'Internal note', false);
    });
  });

  describe('linkReportToIncident', () => {
    test('should link report to incident', async () => {
      resetJSMClient();

      mockMethods.addComment.mockResolvedValue({});

      const result = await linkReportToIncident('TEST-123', '/reports/daily-2024-01-15.md', 'daily');

      expect(result.issueKey).toBe('TEST-123');
      expect(result.linked).toBe(true);

      const commentCall = mockMethods.addComment.mock.calls[0];
      expect(commentCall[1]).toContain('Daily Report Generated');
      expect(commentCall[1]).toContain('/reports/daily-2024-01-15.md');
    });
  });

  describe('clearIncidentCache', () => {
    test('should clear the deduplication cache', async () => {
      resetJSMClient();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-CACHE',
        issueId: '10001'
      });

      const alert = {
        id: 'cache-test',
        metric: 'test_metric',
        level: 'high',
        message: 'Test',
        timestamp: new Date().toISOString()
      };

      await createIncidentFromAlert(alert);

      mockMethods.addComment.mockResolvedValue({});
      const result1 = await createIncidentFromAlert(alert);
      expect(result1.deduplicated).toBe(true);

      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      const result2 = await createIncidentFromAlert(alert);
      expect(result2.deduplicated).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should handle alert without threshold', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-NO-THRESHOLD',
        issueId: '10001'
      });

      const alert = {
        id: 'no-threshold',
        metric: 'healthcheck_failed',
        value: 'API Service',
        level: 'critical',
        message: 'Healthcheck failed',
        timestamp: new Date().toISOString()
      };

      const result = await createIncidentFromAlert(alert);

      expect(result.issueKey).toBe('TEST-NO-THRESHOLD');

      const callArgs = mockMethods.createRequest.mock.calls[0][0];
      expect(callArgs.description).toContain('N/A');
    });

    test('should handle search error in deduplication', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockRejectedValue(new Error('Search failed'));
      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-SEARCH-ERR',
        issueId: '10001'
      });

      const alert = {
        id: 'search-error',
        metric: 'test',
        level: 'high',
        message: 'Test',
        timestamp: new Date().toISOString()
      };

      const result = await createIncidentFromAlert(alert);

      expect(result.issueKey).toBe('TEST-SEARCH-ERR');
    });

    test('should use cache for recent incidents', async () => {
      resetJSMClient();
      clearIncidentCache();

      mockMethods.searchIssues.mockResolvedValue({ issues: [] });
      mockMethods.createRequest.mockResolvedValue({
        issueKey: 'TEST-CACHED',
        issueId: '10001'
      });
      mockMethods.addComment.mockResolvedValue({});

      const alert = {
        id: 'cache-hit',
        metric: 'cached_metric',
        level: 'high',
        message: 'Test',
        timestamp: new Date().toISOString()
      };

      await createIncidentFromAlert(alert);

      const result = await createIncidentFromAlert({ ...alert, id: 'cache-hit-2' });

      expect(result.issueKey).toBe('TEST-CACHED');
      expect(result.deduplicated).toBe(true);
      expect(mockMethods.searchIssues).toHaveBeenCalledTimes(1);
    });
  });
});
