# End-to-End Tests

This directory contains Playwright end-to-end tests for Lydie.

## Test Structure

- `fixtures/` - Test fixtures for authentication and multi-user scenarios
- `utils/` - Helper utilities for common test operations
- `*.spec.ts` - Test specification files

## Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode (see the browser)
npm test -- --headed

# Run specific test file
npm test onboarding.spec.ts

# Run tests in UI mode (interactive)
npm test -- --ui

# Run tests with debugging
npm test -- --debug
```

## Test Files

### Onboarding Tests (`onboarding.spec.ts`)

Comprehensive tests for the onboarding flow including:

- **Onboarding Flow**: Full flow through all steps (documents, assistant, integrations)
- **Checklist Tracking**: Auto-checking of items, manual checking/unchecking
- **Demo Guide Creation**: Creating interactive guide and hiding it after creation
- **State Persistence**: Persisting across reloads and syncing across tabs
- **Completion**: Marking onboarding as complete and not showing it again

### Other Test Files

- `auth.spec.ts` - Authentication flows
- `workspace.spec.ts` - Workspace creation and switching
- `command-menu.spec.ts` - Command menu functionality
- `documents.spec.ts` - Document operations
- `editor.spec.ts` - Editor functionality
- `integrations.spec.ts` - Integration connections
- `custom-fields.spec.ts` - Custom field management
- `collaboration.spec.ts` - Real-time collaboration
- `rest-api.spec.ts` - REST API endpoints

## Fixtures

### Auth Fixture (`fixtures/auth.fixture.ts`)

Provides authenticated test context with:
- `user` - Test user
- `session` - Authentication session
- `organization` - Test organization

Example:
```typescript
test("my test", async ({ page, user, organization }) => {
  // Test code here
})
```

### Multi-User Fixture (`fixtures/auth-multi-user.fixture.ts`)

Provides multiple authenticated users for collaboration tests.

## Utilities

### Onboarding Utils (`utils/onboarding.ts`)

- `navigateToOnboardingStep()` - Navigate to a specific step
- `getOnboardingStatus()` - Get current onboarding state from database
- `updateOnboardingStatus()` - Update onboarding state
- `completeOnboarding()` - Mark onboarding as completed
- `resetOnboarding()` - Reset onboarding to initial state
- `isChecklistItemChecked()` - Check if item is checked
- `waitForOnboardingSync()` - Wait for state sync

### Command Menu Utils (`utils/command-menu.ts`)

- `triggerCommandMenuShortcut()` - Open command menu with Cmd+K

### Database Utils (`utils/db.ts`)

- `createTestUser()` - Create test user and organization
- `createTestOrganization()` - Create test organization

## Writing Tests

### Example: Simple Onboarding Test

```typescript
import { expect, test } from "./fixtures/auth.fixture"
import { navigateToOnboardingStep } from "./utils/onboarding"

test("should navigate through onboarding steps", async ({ page, organization }) => {
  await page.goto(`/w/${organization.slug}/assistant`)
  await page.waitForLoadState("networkidle")

  // Verify we're on documents step
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible()

  // Navigate to assistant step
  await navigateToOnboardingStep(page, "assistant")
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible()
})
```

### Example: Database State Verification

```typescript
import { getOnboardingStatus } from "./utils/onboarding"

test("should save state to database", async ({ page, organization }) => {
  // ... perform actions ...

  // Check database state
  const status = await getOnboardingStatus(organization.id)
  expect(status?.currentStep).toBe("assistant")
  expect(status?.checkedItems).toContain("documents:open-command-menu")
})
```

## Best Practices

1. **Always wait for network idle**: Use `waitForLoadState("networkidle")` after navigation
2. **Use proper selectors**: Prefer `getByRole()` over CSS selectors
3. **Clean up test data**: Delete created documents/organizations in `finally` blocks
4. **Use fixtures**: Leverage existing fixtures for authentication
5. **Test isolation**: Each test should be independent
6. **Database verification**: Verify important state changes in the database
7. **Wait for sync**: Use `waitForTimeout()` when testing Zero sync across tabs

## Debugging

### View test results
```bash
npx playwright show-report
```

### Run with traces
```bash
npm test -- --trace on
```

### Open trace viewer
```bash
npx playwright show-trace trace.zip
```

### VS Code Extension

Install the [Playwright Test for VSCode](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) extension for:
- Running tests from the editor
- Setting breakpoints
- Viewing test results inline

## CI/CD

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Pre-deployment checks

The configuration is in `.github/workflows/` (if exists).

## Troubleshooting

### Tests timing out
- Increase timeout in `playwright.config.ts`
- Check if the app is running on the correct port
- Verify database connection

### Flaky tests
- Add explicit waits for elements
- Use `waitForLoadState("networkidle")`
- Check for race conditions in Zero sync

### Database cleanup issues
- Verify cleanup code runs in `finally` blocks
- Check for foreign key constraints
- Run tests with `--workers=1` to avoid parallelism issues
