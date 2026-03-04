# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to the maintainers. You can find the maintainer email in the `package.json` file or on the GitHub profile.

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., XSS, privilege escalation, data exposure)
- **Affected component** (e.g., content script, popup, specific function)
- **Steps to reproduce** the vulnerability
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up questions

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: 1-3 days
  - High: 1-2 weeks
  - Medium: 2-4 weeks
  - Low: Next planned release

### Disclosure Policy

- We will coordinate with you on the disclosure timeline
- We will credit you in the CHANGELOG (unless you prefer to remain anonymous)
- We will publish a security advisory after the fix is released

## Security Best Practices

### For Users

1. **Only install from trusted sources**
   - Chrome Web Store (once published)
   - Official GitHub releases

2. **Review permissions** before installing
   - This extension only requests: `storage`, `tabs`
   - Host permissions limited to Atlassian domains

3. **Keep the extension updated**
   - Enable automatic updates in Chrome
   - Check for updates regularly

4. **Report suspicious behavior**
   - If the extension requests additional permissions, report it
   - If you notice unexpected network requests, report it

### For Contributors

1. **Never commit secrets**
   - API keys
   - Credentials
   - Personal access tokens

2. **Validate all external data**
   - Sanitize data from Jira API responses
   - Use type guards for runtime validation
   - Escape user-generated content

3. **Follow secure coding practices**
   - No `eval()` or `Function()` constructors
   - No `innerHTML` with unsanitized data
   - Use Content Security Policy

4. **Run security checks**
   ```bash
   # Check for vulnerable dependencies
   npm audit

   # Run linter (includes security rules)
   npm run lint
   ```

## Known Security Measures

### Permissions

- **Minimal permissions**: Only `storage` and `tabs`
- **Restricted host patterns**: `*://*.atlassian.net/*` and `*://*.jira.com/*` only
- **No broad patterns**: Removed dangerous `*://*/jira/*` pattern

### Content Security Policy

- **No inline scripts**: All JavaScript is bundled
- **No eval**: No dynamic code execution
- **No external resources**: Zero runtime dependencies

### Data Privacy

- **Local-only storage**: All data stays on your machine
- **No analytics**: No tracking or telemetry
- **No external API calls**: Only communicates with Jira (user's own instance)

### Build Security

- **Zero runtime dependencies**: No supply chain attack surface
- **TypeScript strict mode**: Type safety prevents many bugs
- **Automated testing**: Catch regressions early
- **CI/CD security**: GitHub Actions with locked-down permissions

## Security Audit History

| Date       | Auditor | Findings | Status   |
| ---------- | ------- | -------- | -------- |
| 2026-03-04 | Internal | 6 issues | Resolved |

### Resolved Issues (v0.1.0)

1. ✅ Overly broad host permissions (`*://*/jira/*`) - Restricted to Atlassian domains
2. ✅ Missing Content Security Policy - Added CSP for extension pages
3. ✅ Broad content script matching (`*://*/secure/*`) - Restricted to Atlassian domains
4. ✅ No XSS sanitization for assignee names - Documented safe usage (textContent)
5. ✅ No input validation on settings - Added validation functions
6. ✅ No secrets management documentation - Added to CONTRIBUTING.md

## Contact

For security-related questions that are not vulnerabilities, feel free to open a GitHub Discussion or issue.
