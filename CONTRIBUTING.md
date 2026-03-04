# Contributing to Jira Plans Enhanced

First off, thank you for considering contributing to Jira Plans Enhanced! It's people like you that make this extension better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and considerate in all interactions.

## Getting Started

### Prerequisites

- **Node.js >= 20** and **npm >= 10**
- A Chromium-based browser (Chrome, Edge, Brave)
- Access to a Jira Plans (Advanced Roadmaps) instance for testing

### Initial Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/jira-plans-enhanced.git
   cd jira-plans-enhanced
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Build the extension**:
   ```bash
   npm run build:dev
   ```

5. **Load the extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist/` folder
   - Navigate to a Jira Plans page and test

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Check code style
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Auto-format code
npm run format
```

### Type Checking

```bash
# Run TypeScript type checker
npm run type-check
```

### Validation Before Commit

```bash
# Run all checks (lint, type-check, test, version validation)
npm run validate
```

### Building

```bash
# Development build (with sourcemaps)
npm run build:dev

# Production build (minified)
npm run build

# Create release package
npm run package
```

## Making Changes

### Branch Naming

- **Feature**: `feature/your-feature-name`
- **Bug fix**: `fix/issue-description`
- **Documentation**: `docs/what-you-changed`
- **Refactor**: `refactor/what-you-refactored`

### Development Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Add tests** for new functionality or bug fixes

4. **Run validation** before committing:
   ```bash
   npm run validate
   ```

5. **Commit your changes** with a clear message

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

## Submitting Changes

### Pull Request Process

1. **Ensure all checks pass**:
   - ✅ Tests pass
   - ✅ Linting passes
   - ✅ Type checking passes
   - ✅ Build succeeds

2. **Update documentation** if needed (README.md, CHANGELOG.md)

3. **Create a Pull Request** with a clear title and description:
   - What problem does this solve?
   - What changes were made?
   - How was it tested?
   - Screenshots (if UI changes)

4. **Link related issues** in the PR description (e.g., "Fixes #123")

5. **Respond to code review feedback** promptly

### PR Review Expectations

- PRs will be reviewed within 2-3 business days
- Feedback should be addressed within 1 week
- Maintainers may request changes or additional tests
- Once approved, maintainers will merge your PR

## Code Style

### TypeScript Style

- Use **strict TypeScript** (all strict flags enabled)
- **Avoid `any` types** - use `unknown` with type guards instead
- **Document public interfaces** with JSDoc comments
- **Export types** for reusability

### Formatting

- Code is formatted with **Prettier** (run `npm run format`)
- Use **2 spaces** for indentation
- Use **single quotes** for strings
- Include **trailing commas** in objects/arrays
- Max line length: **100 characters**

### Naming Conventions

- **Functions**: camelCase with descriptive verb-noun pairs
  - ✅ `findEpicRows()`, `injectBadge()`, `calculatePosition()`
  - ❌ `doStuff()`, `helper()`, `process()`

- **Types/Interfaces**: PascalCase
  - ✅ `EpicData`, `ExtensionSettings`, `PopupRequest`

- **Constants**: UPPER_SNAKE_CASE
  - ✅ `BADGE_CLASS`, `DEFAULT_SETTINGS`, `API_TIMEOUT_MS`

- **Files**: kebab-case
  - ✅ `content-script.ts`, `dom-parser.ts`, `sprint-layout.ts`

### Code Organization

- **Separation of concerns**: Keep modules focused on a single responsibility
- **DRY principle**: Don't repeat yourself - extract common logic
- **Pure functions**: Prefer pure functions over stateful code
- **Error handling**: Use try-catch blocks and graceful degradation

## Testing

### Test Requirements

- **All new features** must include tests
- **Bug fixes** must include regression tests
- **Target coverage**: 90% lines, 85% branches
- **Tests must pass** in CI before merging

### Test Structure

```typescript
describe('FeatureName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Testing Best Practices

- **Test behavior, not implementation** - focus on what, not how
- **Use realistic test data** - mirror actual Jira DOM structures
- **Mock external dependencies** - Chrome APIs, fetch requests
- **Keep tests isolated** - no shared state between tests
- **Use descriptive test names** - explain what is being tested

## Commit Messages

### Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring (no functional change)
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (deps, config, etc.)

### Examples

```
feat(badge): add support for zero-count badge hiding

Add a new setting to hide badges when the engineer count is zero.
This helps reduce visual noise on large roadmaps.

Closes #42
```

```
fix(cache): correct TTL expiration check

The cache TTL check was using > instead of >= which caused
entries to expire 1ms too early.
```

```
docs: update installation instructions for Chrome Web Store
```

## Project Architecture

### Module Overview

```
src/
├── content/          # Content script domain
│   ├── content-script.ts   # Main orchestrator
│   ├── badge.ts            # Badge UI logic
│   ├── dom-parser.ts       # Jira DOM extraction
│   └── sprint-layout.ts    # Timeline positioning
├── popup/            # Popup UI
│   ├── popup.ts            # UI logic
│   ├── popup.html          # UI structure
│   └── popup.css           # UI styling
└── shared/           # Cross-domain types
    ├── types.ts            # Core type definitions
    ├── messages.ts         # Message protocol
    ├── settings.ts         # Settings schema
    └── statistics.ts       # Statistics schema
```

### Key Design Principles

1. **Layered architecture** - Clear separation between DOM parsing, business logic, and UI
2. **Type-safe messaging** - Discriminated unions for popup ↔ content script communication
3. **Performance-focused** - Caching, debouncing, lazy initialization
4. **Testable** - Pure functions, dependency injection, mock-friendly

## Questions?

If you have questions or need help, feel free to:
- Open a [GitHub Discussion](https://github.com/andreibirs/jira-plans-enhanced/discussions)
- Open an issue for bugs or feature requests
- Comment on an existing issue or PR

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
