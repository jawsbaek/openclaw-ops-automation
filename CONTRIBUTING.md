# Contributing to OpenClaw Ops Automation

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/openclaw-ops-automation.git`
3. Add upstream remote: `git remote add upstream https://github.com/jawsbaek/openclaw-ops-automation.git`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Installation

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Generate documentation
npm run docs
```

### Environment Setup

1. Copy example config files (if any):
   ```bash
   cp ops-automation/config/monitoring-sources.example.json ops-automation/config/monitoring-sources.json
   ```

2. Adjust configuration for your local environment

## Project Structure

```
openclaw-ops-automation/
├── ops-automation/
│   ├── agents/           # Agent implementations
│   │   ├── orchestrator.js
│   │   ├── metrics-collector.js
│   │   ├── logs-analyzer.js
│   │   ├── alert-handler.js
│   │   ├── autoheal.js
│   │   └── reporter.js
│   ├── lib/              # Shared utilities
│   │   ├── logger.js
│   │   ├── config-loader.js
│   │   └── file-utils.js
│   ├── config/           # Configuration files
│   └── __tests__/        # Test files
├── .github/              # GitHub Actions workflows
└── docs/                 # Documentation
```

## Coding Standards

### JavaScript Style Guide

- Use ES6+ features (modules, async/await, destructuring, etc.)
- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons
- Use meaningful variable and function names
- Add JSDoc comments for all public functions

### Example

```javascript
/**
 * Processes system metrics and generates alerts
 * @param {Object} metrics - Metrics object
 * @param {Object} thresholds - Alert thresholds
 * @returns {Promise<Array>} Array of alerts
 */
async function processMetrics(metrics, thresholds) {
  const alerts = [];
  
  // Process each metric...
  
  return alerts;
}
```

### JSDoc Documentation

All public functions, classes, and modules should have JSDoc comments:

```javascript
/**
 * @fileoverview Description of the file
 * @module path/to/module
 */

/**
 * Function description
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 * @throws {Error} When something goes wrong
 */
```

## Testing

### Writing Tests

- Place tests in `__tests__/` directory mirroring the source structure
- Name test files with `.test.js` suffix
- Use descriptive test names
- Aim for >80% code coverage
- Test edge cases and error conditions

### Test Structure

```javascript
describe('Component Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test('should do something specific', () => {
    // Arrange
    const input = { /* ... */ };
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.test.js
```

## Pull Request Process

### Before Submitting

1. **Update documentation** - Update README.md and JSDoc comments if needed
2. **Add tests** - Include tests for new features or bug fixes
3. **Run tests** - Ensure all tests pass (`npm test`)
4. **Run linter** - Fix any linting errors (`npm run lint`)
5. **Update CHANGELOG** - Add entry describing your changes

### PR Guidelines

1. **Title**: Use clear, descriptive titles
   - Good: "Add disk cleanup automation to AutoHeal agent"
   - Bad: "Fix stuff"

2. **Description**: Include:
   - What changes were made
   - Why the changes were necessary
   - How to test the changes
   - Related issue numbers (e.g., "Fixes #123")

3. **Commits**: 
   - Use meaningful commit messages
   - Follow conventional commits format when possible:
     - `feat: add new feature`
     - `fix: resolve bug`
     - `docs: update documentation`
     - `test: add test cases`
     - `refactor: improve code structure`

4. **Size**: Keep PRs focused and reasonably sized
   - Large changes should be split into multiple PRs when possible

### Review Process

1. At least one maintainer review is required
2. All CI checks must pass
3. Code coverage should not decrease
4. Address all review comments

## Reporting Bugs

### Before Reporting

1. Check existing issues to avoid duplicates
2. Verify the bug exists on the latest version
3. Collect relevant information:
   - Node.js version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages/logs

### Bug Report Template

```markdown
**Describe the bug**
A clear description of the bug.

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. Configure '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment**
- OS: [e.g., macOS 13.0]
- Node.js: [e.g., 20.10.0]
- Version: [e.g., 1.0.0]

**Logs**
```
Paste relevant logs here
```

**Additional context**
Any other relevant information.
```

## Feature Requests

We welcome feature requests! Please:

1. **Check existing issues** - Someone may have already suggested it
2. **Be specific** - Clearly describe the feature and use cases
3. **Explain the value** - Why would this benefit users?
4. **Consider alternatives** - Are there other ways to achieve the goal?

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Describe the problem.

**Describe the solution you'd like**
What should the feature do?

**Describe alternatives considered**
What other approaches did you consider?

**Use cases**
How would this feature be used?

**Additional context**
Any other relevant information.
```

## Development Workflow

### Branch Naming

- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation updates
- `refactor/component-name` - Code refactoring
- `test/what-tested` - Adding tests

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

Examples:
```
feat(autoheal): add disk cleanup automation

Implements automatic disk cleanup when usage exceeds 90%.
Includes configurable cleanup rules and dry-run mode.

Fixes #42
```

## Questions?

- Open a discussion in GitHub Discussions
- Join our community chat (if available)
- Email maintainers (if provided in README)

Thank you for contributing! 🎉
