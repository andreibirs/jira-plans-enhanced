# Jira Plans Enhanced

[![CI Status](https://github.com/andreibirs/jira-plans-enhanced/workflows/CI/badge.svg)](https://github.com/andreibirs/jira-plans-enhanced/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/abirsan/jira-plans-enhanced)](https://github.com/andreibirs/jira-plans-enhanced/releases)

A Chrome extension that enhances Jira Plans (Advanced Roadmaps) by showing engineer headcount at a glance.

## 🎯 Features

### Engineer Headcount Tracking

**Visual Headcount Badges**
- Left panel badges showing total engineers per epic
- Timeline badges showing per-sprint headcount
- Toggle between sprint-specific and total counts
- Warning indicators for unscheduled stories

**Smart Tracking**
- Counts unique assignees per epic automatically
- Breaks down by sprint/time period
- Handles unscheduled stories
- Real-time updates via MutationObserver

**Control Panel**
- Quick display toggles (left panel, timeline, sprint-specific)
- Real-time statistics dashboard
- Cache management (clear, refresh)
- Settings persistence

**Performance**
- Efficient caching with TTL (5 min default)
- LRU eviction policy (max 100 entries)
- Debounced DOM updates (500ms)
- Minimal API calls

## Installation

### From Release (Recommended)

1. Download the latest `jira-plans-enhanced.zip` from [Releases](https://github.com/andreibirs/jira-plans-enhanced/releases)
2. Unzip the file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top-right)
5. Click "Load unpacked"
6. Select the unzipped folder
7. Navigate to your Jira Plans page and refresh

### From Chrome Web Store (Coming Soon)

Once published to the Chrome Web Store, you'll be able to install with one click.

### From Source

```bash
# Clone the repository
git clone https://github.com/andreibirs/jira-plans-enhanced.git
cd jira-plans-enhanced

# Install dependencies
npm install

# Build the extension
npm run build

# Load the dist/ folder as an unpacked extension in Chrome
```

## Usage

1. **Navigate to Jira Plans** - Open any Advanced Roadmaps view in Jira
2. **See headcount badges** - Badges automatically appear next to epic keys
3. **Hover for details** - Tooltips show engineer names
4. **Configure settings** - Click the extension icon to open the control panel

### Control Panel

Click the extension icon in your toolbar to access:

- **Quick Toggles**
  - Show/hide left panel badges
  - Show/hide timeline badges
  - Toggle sprint-specific vs total count
  - Show/hide zero-count badges

- **Statistics Dashboard**
  - Cache metrics (entries, hit rate, size)
  - Processing stats (API calls, timing)
  - Badge counts (active, loading, warnings)
  - Error tracking

- **Cache Controls**
  - Clear all cache
  - Refresh all visible epics
  - Clear specific epic by key

## Development

### Prerequisites

- Node.js >= 20
- npm >= 10

### Setup

```bash
npm install
```

### Development Scripts

```bash
npm run build          # Build extension for production
npm run bundle         # Bundle TypeScript without assets
npm run clean          # Remove dist/ directory
npm run lint           # Check code quality
npm run lint:fix       # Fix linting issues
npm test               # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run package        # Build and create zip file
```

### Project Structure

```
jira-plans-enhanced/
├── .github/
│   └── workflows/        # GitHub Actions CI/CD
├── src/
│   ├── content/          # Content script logic
│   │   ├── content-script.ts
│   │   ├── badge.ts
│   │   ├── dom-parser.ts
│   │   └── sprint-layout.ts
│   ├── popup/            # Extension popup
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.ts
│   ├── shared/           # Shared types and utilities
│   │   ├── settings.ts
│   │   ├── statistics.ts
│   │   └── messages.ts
│   └── __tests__/        # Test files
├── dist/                 # Built extension (generated)
├── icons/                # Extension icons
└── package.json
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Building for Production

```bash
# Build extension
npm run build

# Create release zip
npm run package
```

The packaged extension will be created as `jira-plans-enhanced.zip`.

## CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Pipeline** - Runs on every push/PR:
  - Linting
  - Tests with coverage
  - Build verification

- **Release Pipeline** - Runs on version tags (`v*`):
  - Builds extension
  - Creates zip artifact
  - Generates GitHub release

### Creating a Release

```bash
# Update version in manifest.json, manifest.dist.json, and package.json
# Update CHANGELOG.md

# Commit changes
git add .
git commit -m "Release v0.2.0"

# Create and push tag
git tag v0.2.0
git push origin main --tags
```

GitHub Actions will automatically create a release with the extension zip.

## Configuration

### Default Settings

```typescript
{
  display: {
    showLeftPanelBadges: true,
    showTimelineBadges: true,
    showSprintSpecificBadges: true,
    showZeroCountBadges: false
  },
  performance: {
    cacheTtlMs: 300000,      // 5 minutes
    maxCacheEntries: 100,
    debounceDelayMs: 500,
    apiTimeoutMs: 5000
  }
}
```

All settings can be configured via the popup control panel.

## Permissions

This extension requires the following permissions:

- `storage` - To persist user settings
- `tabs` - To communicate with Jira pages
- `host_permissions` for your Jira domain - To fetch epic data

## Privacy

This extension:
- ✅ Only runs on Jira Plans pages
- ✅ Stores settings locally using Chrome Storage API
- ✅ Does not collect or transmit any user data
- ✅ Does not use external analytics
- ✅ All data stays on your machine

See [PRIVACY.md](PRIVACY.md) for full details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Troubleshooting

### Badges not appearing
1. Refresh the Jira Plans page
2. Check that you're on a Jira Plans (Advanced Roadmaps) page
3. Open the popup and verify settings are enabled
4. Check browser console for errors

### Performance issues
1. Reduce cache TTL in settings
2. Increase debounce delay
3. Clear cache via control panel
4. Reduce max cache entries

### Extension not loading
1. Verify you're using Chrome/Edge (Chromium-based)
2. Check `chrome://extensions/` for errors
3. Try removing and re-adding the extension
4. Check manifest.json is valid

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for teams using Jira Plans (Advanced Roadmaps)
- Uses Chrome Extension Manifest V3
- Inspired by the need for better visibility and productivity in roadmap planning

## Support

- 🐛 [Report a bug](https://github.com/andreibirs/jira-plans-enhanced/issues)

---

**Note**: This extension is not affiliated with or endorsed by Atlassian or Jira.
