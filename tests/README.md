# Tests

This directory contains the Playwright End-to-End tests for the platform.

## Test Suites

1. **`portal.e2e.spec.js`**: Portal and access-layer tests for the FastAPI UI. Validates page rendering, CSRF rejection, lab links, embedded terminal iframe/WebSocket/writability, checker action behavior, and instructor view.

## Running Locally

```bash
# Run portal UI tests locally
npm run test:portal

# Run the universal lab solver against the live environment
npm run test:labs
```
