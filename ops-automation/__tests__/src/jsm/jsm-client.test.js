import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

const { JSMClient } = await import('../../../src/jsm/jsm-client.js');

describe('JSMClient', () => {
  let mockFetch;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.JSM_EMAIL = 'test@example.com';
    process.env.JSM_API_TOKEN = 'test-token-12345';

    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with valid config', () => {
      const config = {
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: { maxRequestsPerMinute: 50 }
      };

      const client = new JSMClient(config);
      expect(client).toBeDefined();
    });

    test('should throw error for missing environment variable', () => {
      delete process.env.JSM_EMAIL;

      const config = {
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      };

      expect(() => new JSMClient(config)).toThrow('Environment variable JSM_EMAIL is not set');
    });

    test('should throw error for unsupported auth type', () => {
      const config = {
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: { type: 'oauth' },
        rateLimiting: {}
      };

      expect(() => new JSMClient(config)).toThrow('Unsupported auth type: oauth');
    });

    test('should support bearer auth type', () => {
      process.env.JSM_BEARER_TOKEN = 'bearer-token-123';

      const config = {
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'bearer',
          token: '${JSM_BEARER_TOKEN}'
        },
        rateLimiting: {}
      };

      const client = new JSMClient(config);
      expect(client).toBeDefined();
    });
  });

  describe('createRequest', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: { maxRequestsPerMinute: 100 }
      });
    });

    test('should create a service request successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          issueKey: 'TEST-123',
          issueId: '10001'
        })
      });

      const result = await client.createRequest({
        requestTypeId: '10001',
        summary: 'Test incident',
        description: 'Test description',
        priority: 'High'
      });

      expect(result.issueKey).toBe('TEST-123');
      expect(result.issueId).toBe('10001');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/servicedeskapi/request',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('should include custom fields in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ issueKey: 'TEST-124', issueId: '10002' })
      });

      await client.createRequest({
        requestTypeId: '10001',
        summary: 'Test',
        description: 'Desc',
        customFields: {
          customfield_10100: 'custom-value'
        }
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.requestFieldValues.customfield_10100).toBe('custom-value');
    });

    test('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request: Invalid field'
      });

      await expect(
        client.createRequest({
          requestTypeId: '10001',
          summary: 'Test',
          description: 'Desc'
        })
      ).rejects.toThrow('JSM API error: 400 - Bad Request: Invalid field');
    });

    test('should retry on rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '1']])
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ issueKey: 'TEST-125', issueId: '10003' })
        });

      const result = await client.createRequest({
        requestTypeId: '10001',
        summary: 'Test',
        description: 'Desc'
      });

      expect(result.issueKey).toBe('TEST-125');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRequest', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should get request by issue key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issueKey: 'TEST-123',
          currentStatus: { status: 'Open' }
        })
      });

      const result = await client.getRequest('TEST-123');

      expect(result.issueKey).toBe('TEST-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/servicedeskapi/request/TEST-123',
        expect.any(Object)
      );
    });
  });

  describe('addComment', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should add public comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'comment-1' })
      });

      await client.addComment('TEST-123', 'Test comment', true);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.body).toBe('Test comment');
      expect(callBody.public).toBe(true);
    });

    test('should add internal comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'comment-2' })
      });

      await client.addComment('TEST-123', 'Internal note', false);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.public).toBe(false);
    });
  });

  describe('transitionIssue', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should transition issue without comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      await client.transitionIssue('TEST-123', '31');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.transition.id).toBe('31');
      expect(callBody.update).toBeUndefined();
    });

    test('should transition issue with comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      await client.transitionIssue('TEST-123', '31', 'Resolved by AutoHeal');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.transition.id).toBe('31');
      expect(callBody.update.comment[0].add.body).toBe('Resolved by AutoHeal');
    });
  });

  describe('updateIssue', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should update issue fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      await client.updateIssue('TEST-123', {
        customfield_10100: 'updated-value'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/issue/TEST-123',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  describe('addLabels', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should add multiple labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      await client.addLabels('TEST-123', ['label1', 'label2']);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.update.labels).toEqual([{ add: 'label1' }, { add: 'label2' }]);
    });
  });

  describe('searchIssues', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should search issues with JQL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          issues: [{ key: 'TEST-1' }, { key: 'TEST-2' }],
          total: 2
        })
      });

      const result = await client.searchIssues('project = TEST');

      expect(result.issues).toHaveLength(2);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.jql).toBe('project = TEST');
    });
  });

  describe('getServiceDesk', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '5',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should get service desk info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: '5',
          projectName: 'IT Service Desk'
        })
      });

      const result = await client.getServiceDesk();

      expect(result.id).toBe('5');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/servicedeskapi/servicedesk/5',
        expect.any(Object)
      );
    });
  });

  describe('getRequestTypes', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should get request types for service desk', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          values: [
            { id: '1', name: 'Incident' },
            { id: '2', name: 'Service Request' }
          ]
        })
      });

      const result = await client.getRequestTypes();

      expect(result.values).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    let client;

    beforeEach(() => {
      client = new JSMClient({
        baseUrl: 'https://test.atlassian.net',
        serviceDeskId: '1',
        auth: {
          type: 'basic',
          email: '${JSM_EMAIL}',
          apiToken: '${JSM_API_TOKEN}'
        },
        rateLimiting: {}
      });
    });

    test('should handle timeout and retry', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'TimeoutError';

      mockFetch.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ issueKey: 'TEST-1' })
      });

      const result = await client.getRequest('TEST-1');

      expect(result.issueKey).toBe('TEST-1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should fail after max retries on rate limit', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '0']])
      });

      await expect(client.getRequest('TEST-1')).rejects.toThrow('Rate limit exceeded after max retries');

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
