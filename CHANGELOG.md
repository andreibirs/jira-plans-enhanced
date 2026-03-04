# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-02

### Added
- Engineer headcount tracking on Jira Plans epics
- Left panel badges showing total engineers per epic
- Timeline badges showing per-sprint headcount
- Sprint-specific headcount breakdown
- Toggle between sprint-specific and total counts
- Warning indicators for unscheduled stories
- Control panel for settings management
- Real-time statistics dashboard
- Cache management with TTL (5 min default) and LRU eviction
- Configurable display options (show/hide badges, zero-count badges)
- Performance tracking (cache hit rate, API call metrics, processing times)
- Error tracking and reporting
- Settings persistence using chrome.storage.sync
- Debounced DOM updates (500ms default) for performance
- Lazy ResizeObserver initialization for badge repositioning
- Comprehensive test suite with Jest
- CI/CD pipeline with GitHub Actions
- Automated releases with GitHub workflows

### Security
- Manifest V3 compliance
- Minimal permissions (storage, tabs only)
- Host permissions restricted to Atlassian domains
- Content Security Policy for extension pages
- No external dependencies (zero supply chain risk)
- Privacy-respecting (no analytics, local-only data)

[0.1.0]: https://github.com/andreibirs/jira-plans-enhanced/releases/tag/v0.1.0
