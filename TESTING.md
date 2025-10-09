# Testing Guide

This project uses Playwright for end-to-end testing. The tests cover the new holiday chain algorithm features including mode switching, chain calculation, and interactive hover cards.

## Running Tests

### Prerequisites

Make sure you have installed all dependencies:

```bash
npm install
```

### Running All Tests

To run all tests in headless mode:

```bash
npm run test:e2e
```

### Running Tests with UI

To run tests with Playwright's interactive UI:

```bash
npm run test:e2e:ui
```

### Running Tests in Headed Mode

To see the browser while tests run:

```bash
npm run test:e2e:headed
```

### Debugging Tests

To debug tests step by step:

```bash
npm run test:e2e:debug
```

## Test Coverage

### 1. Mode Switching Tests (`mode-switching.spec.ts`)

Tests the dropdown menu for switching between Optimal and User modes:

- ✓ Default mode is "Optimal"
- ✓ Can switch to "User Mode" and dialog opens
- ✓ Can enter valid leave days (1-15)
- ✓ Shows validation error for invalid input
- ✓ Cancel button closes dialog and reverts to Optimal
- ✓ Can switch back to Optimal mode from User mode
- ✓ Can use Enter key to submit dialog

### 2. Chain Algorithm Tests (`chain-algorithm.spec.ts`)

Tests the holiday chain calculation functionality:

- ✓ Calculate button is disabled when no manual selections
- ✓ Calculate chain in Optimal mode
- ✓ Calculate chain in User mode with specific leave days
- ✓ Shows appropriate message when no chains found
- ✓ Calculation shows loading spinner
- ✓ Can cancel calculation while in progress
- ✓ Status message updates with chain results
- ✓ Multiple chains are calculated for different months

### 3. Hover Interaction Tests (`hover-interactions.spec.ts`)

Tests the hover card functionality on calendar months:

- ✓ Hover card does not show when no chains calculated
- ✓ Hover card shows after calculation with chains
- ✓ Hover card displays chain information
- ✓ Can click on chain option to select it
- ✓ Selected chain is highlighted in hover card
- ✓ Boundary chain indicators are shown (← →)
- ✓ Hover card closes when mouse leaves
- ✓ Multiple chains are displayed when available

### 4. Integration Tests (`integration.spec.ts`)

End-to-end workflows:

- ✓ Complete workflow: Select country → year → holidays → calculate → view chains
- ✓ Switch modes mid-session and recalculate
- ✓ Recalculate after selecting different chain from hover card
- ✓ Year change resets selections and chains
- ✓ Calendar highlighting updates when chains are calculated

## Test Architecture

### Test Structure

```
tests/
└── e2e/
    ├── mode-switching.spec.ts     # Mode selection and dialog tests
    ├── chain-algorithm.spec.ts    # Chain calculation tests
    ├── hover-interactions.spec.ts # Hover card interaction tests
    └── integration.spec.ts        # End-to-end integration tests
```

### Configuration

The Playwright configuration is in `playwright.config.ts` with the following settings:

- **Base URL**: `http://localhost:5173` (Vite dev server)
- **Browsers**: Chromium, Firefox, WebKit
- **Test Directory**: `./tests`
- **Web Server**: Automatically starts `npm run dev` before tests

### Test IDs

The application uses data-testid attributes for reliable test selectors:

- `mode-dropdown` - Mode selection dropdown button
- `optimal-mode-item` - Optimal mode menu item
- `user-mode-item` - User mode menu item
- `user-mode-dialog` - User input dialog
- `leave-days-input` - Leave days input field
- `dialog-calculate-button` - Dialog confirm button
- `dialog-cancel-button` - Dialog cancel button
- `calculate-chain-button` - Main calculate button
- `month-trigger-{monthKey}` - Month calendar trigger
- `month-hover-card-{monthKey}` - Month hover card
- `chain-option-{index}` - Chain option in hover card

## Writing New Tests

When adding new tests:

1. Create a new `.spec.ts` file in `tests/e2e/`
2. Use descriptive test names
3. Add appropriate `data-testid` attributes to new UI elements
4. Follow the existing test patterns for consistency
5. Use helper functions for common operations

Example:

```typescript
import { test, expect } from '@playwright/test';

test.describe('New Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="mode-dropdown"]');
  });

  test('should do something', async ({ page }) => {
    // Your test code here
    await expect(page.getByTestId('some-element')).toBeVisible();
  });
});
```

## Continuous Integration

Tests are configured to run in CI environments with:

- Retry on failure (2 retries in CI)
- HTML reporter for test results
- Trace collection on failure

To run tests in CI mode:

```bash
CI=true npm run test:e2e
```

## Troubleshooting

### Tests Failing Locally

1. Make sure the dev server is running: `npm run dev`
2. Clear browser cache and storage
3. Check that all dependencies are installed
4. Run tests with headed mode to see what's happening: `npm run test:e2e:headed`

### Timeout Issues

If tests are timing out:

1. Increase timeout in test files if needed
2. Check network conditions (holiday API calls)
3. Ensure your system has enough resources

### Flaky Tests

If tests are inconsistent:

1. Add appropriate `waitForTimeout` or `waitForSelector` calls
2. Use more specific selectors
3. Check for race conditions in async operations

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Test Assertions](https://playwright.dev/docs/test-assertions)
