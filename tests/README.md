# Tests

This directory contains the Playwright End-to-End tests for the platform.

## Test Suites

1. **`portal.e2e.spec.js`**: Portal and access-layer tests for the FastAPI UI. Validates page rendering, CSRF rejection, lab links, embedded terminal iframe/WebSocket/writability, checker action behavior, and instructor view.

## Running Locally

```bash
npm install
npx playwright install

# Run portal UI tests locally
npm run test:portal
```

Live tests require portal credentials and may change lab runtime state. Export the target environment first:

```bash
export PORTAL_BASE_URL=http://<x02-ip>
export PORTAL_USER=student01
export PORTAL_PASSWORD=<student-password>

# Run the universal lab solver against the live environment
npm run test:labs
```
