/**
 * Tests for PR automation example
 */

const { greetUser, calculateSum, canAutoMerge } = require('./pr-automation-example');

describe('PR Automation Example', () => {
  describe('greetUser', () => {
    it('should greet user with provided name', () => {
      const result = greetUser('Alice');
      expect(result).toBe('Hello, Alice! Welcome to the PR automation system.');
    });

    it('should throw error if name is not provided', () => {
      expect(() => greetUser()).toThrow('Name is required');
      expect(() => greetUser('')).toThrow('Name is required');
    });
  });

  describe('calculateSum', () => {
    it('should calculate sum of numbers', () => {
      expect(calculateSum([1, 2, 3, 4, 5])).toBe(15);
      expect(calculateSum([10, 20, 30])).toBe(60);
    });

    it('should return 0 for empty array', () => {
      expect(calculateSum([])).toBe(0);
    });

    it('should throw error if input is not an array', () => {
      expect(() => calculateSum('not an array')).toThrow('Input must be an array');
      expect(() => calculateSum(null)).toThrow('Input must be an array');
    });
  });

  describe('canAutoMerge', () => {
    it('should return true when all criteria are met', () => {
      const pr = {
        checks: [{ status: 'success' }, { status: 'success' }],
        hasConflicts: false,
        approvals: 2,
        aiReviewScore: 9,
        securityScan: { passed: true }
      };

      expect(canAutoMerge(pr)).toBe(true);
    });

    it('should return false when checks fail', () => {
      const pr = {
        checks: [{ status: 'success' }, { status: 'failure' }],
        hasConflicts: false,
        approvals: 2,
        aiReviewScore: 9,
        securityScan: { passed: true }
      };

      expect(canAutoMerge(pr)).toBe(false);
    });

    it('should return false when AI score is too low', () => {
      const pr = {
        checks: [{ status: 'success' }],
        hasConflicts: false,
        approvals: 2,
        aiReviewScore: 6,
        securityScan: { passed: true }
      };

      expect(canAutoMerge(pr)).toBe(false);
    });

    it('should return false when security scan fails', () => {
      const pr = {
        checks: [{ status: 'success' }],
        hasConflicts: false,
        approvals: 2,
        aiReviewScore: 9,
        securityScan: { passed: false }
      };

      expect(canAutoMerge(pr)).toBe(false);
    });
  });
});
