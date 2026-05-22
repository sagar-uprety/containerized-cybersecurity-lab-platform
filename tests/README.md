# Tests

This directory contains the Playwright End-to-End tests for the platform.

## Test Suites

1. **`portal.e2e.spec.js`**: Core UI tests for the FastAPI portal. Validates that the login works, endpoints display, the split-pane terminal UI renders, CSRF tokens work, and the instructor view functions.

## Running Locally

```bash
# Run portal UI tests locally
npm run test:portal

# Run the universal lab solver against the live environment
npm run test:labs
```
