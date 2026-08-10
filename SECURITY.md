# Security policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities in a public issue. Use GitHub's private vulnerability reporting feature on this repository instead.

Include the affected component, reproduction steps, potential impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Sensitive deployments

The optional push service can process browser endpoints, bearer credentials, medication reminder text, and schedules. Deployers must protect Azure settings, restrict allowed origins, rotate compromised VAPID or storage credentials, and avoid committing `backend/local.settings.json` or generated deployment output.
