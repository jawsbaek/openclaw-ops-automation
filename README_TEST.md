# Testing Notes

## Current Status

All test files have been created in `ops-automation/__tests__/` but Jest configuration for ES modules needs adjustment.

## Running Tests

The test infrastructure is in place but requires Jest ES module configuration:

```bash
# Tests are written but need ES module config fix
npm test
```

## Test Files Created

- `__tests__/lib/logger.test.js` - Logger utility tests
- `__tests__/lib/config-loader.test.js` - Config loader tests
- `__tests__/lib/file-utils.test.js` - File utilities tests
- `__tests__/agents/metrics-collector.test.js` - Metrics collector tests
- `__tests__/agents/alert-handler.test.js` - Alert handler tests

## Temporary Workaround

To run individual agents for manual testing:

```bash
# Test metrics collection
node ops-automation/agents/metrics-collector.js

# Test log analysis
node ops-automation/agents/logs-analyzer.js

# Test alert handling
node ops-automation/agents/alert-handler.js

# Test autoheal
node ops-automation/agents/autoheal.js disk_space_low

# Test reporter
node ops-automation/agents/reporter.js daily

# Test orchestrator (one cycle)
node ops-automation/agents/orchestrator.js once
```

## Jest ES Module Configuration

The project uses ES modules (`"type": "module"` in package.json). Jest requires special configuration for this.

Recommended fix (for future):
1. Use `node --experimental-vm-modules` with Jest
2. Or migrate to Vitest which has better ES module support
3. Or use `@babel/preset-env` for transpilation

## Alternative: Vitest

Consider migrating to Vitest for better ES module support:

```bash
npm install -D vitest @vitest/ui
```

Update `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
