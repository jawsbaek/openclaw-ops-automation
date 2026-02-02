/**
 * Example file to test PR automation system
 * This demonstrates the auto-review and auto-merge workflow
 */

/**
 * Greets a user by name
 * @param {string} name - The name to greet
 * @returns {string} The greeting message
 */
function greetUser(name) {
  if (!name) {
    throw new Error('Name is required');
  }

  return `Hello, ${name}! Welcome to the PR automation system.`;
}

/**
 * Calculates the sum of an array of numbers
 * @param {number[]} numbers - Array of numbers to sum
 * @returns {number} The sum of all numbers
 */
function calculateSum(numbers) {
  if (!Array.isArray(numbers)) {
    throw new Error('Input must be an array');
  }

  return numbers.reduce((sum, num) => sum + num, 0);
}

/**
 * Checks if a PR meets auto-merge criteria
 * @param {object} pr - Pull request object
 * @returns {boolean} True if PR can be auto-merged
 */
function canAutoMerge(pr) {
  const criteria = {
    allChecksPassed: pr.checks.every((check) => check.status === 'success'),
    noConflicts: !pr.hasConflicts,
    minApprovals: pr.approvals >= 1,
    aiScore: pr.aiReviewScore >= 8,
    securityClean: pr.securityScan.passed
  };

  return Object.values(criteria).every(Boolean);
}

export { greetUser, calculateSum, canAutoMerge };
