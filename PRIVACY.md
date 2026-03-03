# Privacy Policy

**Last updated: March 2, 2026**

## Overview

Jira Plans Enhanced ("the extension") respects your privacy and is committed to protecting any data associated with your use of this extension.

## Data Collection

**We do not collect any personal data.**

The extension:
- ❌ Does NOT collect any personal information
- ❌ Does NOT transmit any data to external servers
- ❌ Does NOT use analytics or tracking services
- ❌ Does NOT share any information with third parties

## Data Storage

The extension stores the following data **locally on your device only**:

### Settings Data
- Display preferences (show/hide badges, toggle options)
- Performance settings (cache TTL, debounce delay)
- These settings are stored using Chrome's Storage API
- **Storage location**: Your browser's local storage
- **Access**: Only you and the extension can access this data
- **Lifetime**: Persists until you uninstall the extension or clear browser data

### Cache Data
- Epic keys and assignee counts
- Temporarily cached to improve performance
- Automatically expires after configured TTL (default: 5 minutes)
- **Storage location**: Extension memory (RAM)
- **Lifetime**: Cleared on browser restart or cache expiry

## Permissions

The extension requires the following Chrome permissions:

### storage
- **Purpose**: To save your settings locally
- **Scope**: Only extension settings, no personal data
- **Access**: Local to your device only

### tabs
- **Purpose**: To communicate with Jira Plans pages
- **Scope**: Only active when you're on Jira pages
- **Access**: Read-only access to determine active tab

### host_permissions (your Jira domain)
- **Purpose**: To count assignees on Jira Plans pages
- **Scope**: Only runs on Jira Plans pages you explicitly visit
- **Access**: Reads DOM data to count unique assignees

## What We Can See

The extension only accesses:
- Epic keys visible on your Jira Plans page
- Assignee names visible in the DOM
- Story data visible in your current view

**We do NOT:**
- Access data from other tabs or websites
- Read your browsing history
- Access your Jira credentials
- Store any Jira data permanently
- Transmit any data outside your browser

## Third-Party Services

This extension does not integrate with any third-party services. All processing happens locally in your browser.

## Security

- All data is stored locally using Chrome's secure storage APIs
- No data leaves your device
- No external network requests are made
- Uses Chrome Extension Manifest V3 for enhanced security

## Your Rights

You can:
- **View settings**: Click the extension icon to see all stored settings
- **Clear settings**: Uninstall the extension to remove all stored data
- **Control permissions**: Manage extension permissions in Chrome settings

## Children's Privacy

This extension is not directed at children under the age of 13. We do not knowingly collect any information from children.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be posted on this page with an updated "Last updated" date.

## Contact

For questions about this privacy policy or the extension:
- **GitHub Issues**: https://github.com/andreibirs/jira-plans-enhanced/issues
- **Repository**: https://github.com/andreibirs/jira-plans-enhanced

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

## Summary

**In plain English:**
- We don't collect your data
- We don't track you
- Your settings stay on your computer
- Nothing leaves your browser
- You're in control

---

**Note**: This extension is not affiliated with or endorsed by Atlassian or Jira.
