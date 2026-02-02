/**
 * @fileoverview JSM (Jira Service Management) API Client
 * @module src/jsm/jsm-client
 */

import { createLogger } from '../../lib/logger.js';

const logger = createLogger('jsm-client');

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

export class JSMClient {
  #baseUrl;
  #serviceDeskId;
  #authHeader;
  #rateLimiter;

  constructor(config) {
    this.#baseUrl = config.baseUrl;
    this.#serviceDeskId = config.serviceDeskId;
    this.#authHeader = this.#createAuthHeader(config.auth);
    this.#rateLimiter = new RateLimiter(config.rateLimiting);

    logger.info('JSM client initialized', {
      baseUrl: this.#baseUrl,
      serviceDeskId: this.#serviceDeskId
    });
  }

  #createAuthHeader(auth) {
    if (auth.type === 'basic') {
      const email = this.#resolveEnvVar(auth.email);
      const token = this.#resolveEnvVar(auth.apiToken);
      const credentials = Buffer.from(`${email}:${token}`).toString('base64');
      return `Basic ${credentials}`;
    }

    if (auth.type === 'bearer') {
      const token = this.#resolveEnvVar(auth.token);
      return `Bearer ${token}`;
    }

    throw new Error(`Unsupported auth type: ${auth.type}`);
  }

  #resolveEnvVar(value) {
    if (typeof value !== 'string') return value;

    const match = value.match(/^\${(.+)}$/);
    if (match) {
      const envVar = process.env[match[1]];
      if (!envVar) {
        throw new Error(`Environment variable ${match[1]} is not set`);
      }
      return envVar;
    }
    return value;
  }

  async #request(method, path, body = null, retryCount = 0) {
    await this.#rateLimiter.waitForSlot();

    const url = `${this.#baseUrl}${path}`;
    const options = {
      method,
      headers: {
        Authorization: this.#authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    logger.debug('JSM API request', { method, path });

    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        logger.warn('Rate limited by JSM API', { retryAfter });

        if (retryCount < MAX_RETRIES) {
          await this.#sleep(retryAfter * 1000);
          return this.#request(method, path, body, retryCount + 1);
        }
        throw new Error('Rate limit exceeded after max retries');
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`JSM API error: ${response.status} - ${errorBody}`);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      if (error.name === 'TimeoutError' && retryCount < MAX_RETRIES) {
        logger.warn('Request timeout, retrying', { path, retryCount });
        return this.#request(method, path, body, retryCount + 1);
      }

      logger.error('JSM API request failed', {
        method,
        path,
        error: error.message
      });
      throw error;
    }
  }

  #sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createRequest(fields) {
    const requestBody = {
      serviceDeskId: this.#serviceDeskId,
      requestTypeId: fields.requestTypeId,
      requestFieldValues: {
        summary: fields.summary,
        description: fields.description,
        ...fields.customFields
      }
    };

    if (fields.priority) {
      requestBody.requestFieldValues.priority = { name: fields.priority };
    }

    logger.info('Creating JSM request', { summary: fields.summary });

    const response = await this.#request('POST', '/rest/servicedeskapi/request', requestBody);

    logger.info('JSM request created', {
      issueKey: response.issueKey,
      issueId: response.issueId
    });

    return response;
  }

  async getRequest(issueIdOrKey) {
    return this.#request('GET', `/rest/servicedeskapi/request/${issueIdOrKey}`);
  }

  async addComment(issueIdOrKey, comment, isPublic = true) {
    const body = {
      body: comment,
      public: isPublic
    };

    logger.info('Adding comment to JSM request', { issueIdOrKey, isPublic });

    return this.#request('POST', `/rest/servicedeskapi/request/${issueIdOrKey}/comment`, body);
  }

  async transitionIssue(issueIdOrKey, transitionId, comment = null) {
    const body = {
      transition: { id: transitionId }
    };

    if (comment) {
      body.update = {
        comment: [{ add: { body: comment } }]
      };
    }

    logger.info('Transitioning JSM issue', { issueIdOrKey, transitionId });

    return this.#request('POST', `/rest/api/3/issue/${issueIdOrKey}/transitions`, body);
  }

  async updateIssue(issueIdOrKey, fields) {
    const body = { fields };

    logger.info('Updating JSM issue', { issueIdOrKey });

    return this.#request('PUT', `/rest/api/3/issue/${issueIdOrKey}`, body);
  }

  async addLabels(issueIdOrKey, labels) {
    const body = {
      update: {
        labels: labels.map((label) => ({ add: label }))
      }
    };

    logger.info('Adding labels to JSM issue', { issueIdOrKey, labels });

    return this.#request('PUT', `/rest/api/3/issue/${issueIdOrKey}`, body);
  }

  async searchIssues(jql, fields = ['key', 'summary', 'status']) {
    const body = {
      jql,
      fields,
      maxResults: 50
    };

    return this.#request('POST', '/rest/api/3/search', body);
  }

  async getServiceDesk() {
    return this.#request('GET', `/rest/servicedeskapi/servicedesk/${this.#serviceDeskId}`);
  }

  async getRequestTypes() {
    return this.#request('GET', `/rest/servicedeskapi/servicedesk/${this.#serviceDeskId}/requesttype`);
  }
}

class RateLimiter {
  #maxRequests;
  #windowMs;
  #requests;

  constructor(config = {}) {
    this.#maxRequests = config.maxRequestsPerMinute || 50;
    this.#windowMs = 60000;
    this.#requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.#requests = this.#requests.filter((time) => now - time < this.#windowMs);

    if (this.#requests.length >= this.#maxRequests) {
      const oldestRequest = this.#requests[0];
      const waitTime = this.#windowMs - (now - oldestRequest);

      logger.debug('Rate limiter waiting', { waitTime });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.#requests.push(Date.now());
  }
}

export default JSMClient;
