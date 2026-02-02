# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of OpenClaw Ops Automation seriously. If you believe you have found a security vulnerability, please report it to us responsibly.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security vulnerabilities by:

1. **Email**: Send details to `security@example.com` (replace with actual email)
2. **Private disclosure**: Use GitHub's private vulnerability reporting feature

### What to Include

Please include the following information in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)
- Your name/handle for acknowledgment (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Varies by severity
  - Critical: 7-14 days
  - High: 14-30 days
  - Medium: 30-60 days
  - Low: 60-90 days

### Disclosure Policy

- We will coordinate with you on the disclosure timeline
- We request that you do not disclose the vulnerability publicly until we have released a fix
- We will acknowledge your contribution in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

### For Operators

1. **Authentication & Authorization**
   - Enable authentication for all agent communications
   - Use token-based authentication for webhooks
   - Implement RBAC for sensitive operations
   - Rotate credentials regularly

2. **Command Execution**
   - Review AutoHeal playbooks before deployment
   - Enable approval for destructive actions
   - Use dry-run mode for testing
   - Audit all executed commands

3. **Secrets Management**
   - Never commit secrets to version control
   - Use environment variables or a secrets vault
   - Encrypt sensitive configuration files
   - Restrict access to credential files

4. **Network Security**
   - Enable HTTPS/TLS for all API endpoints
   - Implement rate limiting on webhooks
   - Verify webhook signatures
   - Use firewall rules to restrict access

5. **Monitoring & Auditing**
   - Enable comprehensive audit logging
   - Monitor failed authentication attempts
   - Set up alerts for security events
   - Regularly review audit logs

### For Developers

1. **Input Validation**
   - Validate all external inputs
   - Sanitize user-provided data
   - Use parameterized queries/commands
   - Implement allow-lists, not deny-lists

2. **Dependency Management**
   - Regularly update dependencies
   - Enable Dependabot or similar tools
   - Scan for known vulnerabilities
   - Pin dependency versions

3. **Code Security**
   - Follow secure coding practices
   - Perform security code reviews
   - Use static analysis tools (SAST)
   - Implement least privilege principle

4. **Container Security**
   - Run as non-root user
   - Use minimal base images
   - Scan images for vulnerabilities
   - Implement read-only filesystems where possible

## Known Security Considerations

### AutoHeal Command Execution

AutoHeal executes shell commands to remediate issues. This is a powerful feature that requires careful configuration:

- **Risk**: Command injection if inputs are not properly sanitized
- **Mitigation**: 
  - Commands are validated against a whitelist
  - Approval required for destructive actions
  - All commands are logged and auditable
  - Dry-run mode available for testing

### Webhook Endpoints

Alert webhooks can trigger automated actions:

- **Risk**: Unauthorized parties could trigger false alerts or remediation
- **Mitigation**:
  - Implement webhook signature verification
  - Use authentication tokens
  - Rate limit webhook requests
  - Validate webhook payloads

### Agent Communication

Agents communicate via OpenClaw sessions:

- **Risk**: Unauthorized agents could be spawned or messages intercepted
- **Mitigation**:
  - Agents run in isolated sessions
  - OpenClaw handles session security
  - Agent spawning requires authentication
  - Message passing is internal to OpenClaw

### Log and Metric Data

System logs and metrics may contain sensitive information:

- **Risk**: Information disclosure through logs
- **Mitigation**:
  - Mask sensitive data in logs
  - Encrypt stored metrics and logs
  - Restrict file permissions
  - Implement log retention policies

## Security Features

### Implemented

- ✅ Isolated agent sessions
- ✅ Command timeout enforcement
- ✅ Incident audit trail
- ✅ Configuration file validation
- ✅ Alert deduplication

### Planned

- 🔄 Token-based authentication
- 🔄 Webhook signature verification
- 🔄 Secrets vault integration
- 🔄 Enhanced audit logging
- 🔄 RBAC implementation
- 🔄 Rate limiting
- 🔄 Input sanitization framework

## Compliance

This system is designed to support compliance with:

- **SOC 2**: Audit logging, access controls
- **ISO 27001**: Security controls, incident management
- **GDPR**: Data protection, audit trails (if handling personal data)

Operators are responsible for configuring the system appropriately for their compliance requirements.

## Security Contacts

- Security Email: `security@example.com` (replace with actual)
- Security Advisories: Check GitHub Security tab
- Security Updates: Watch this repository for security releases

## Acknowledgments

We appreciate responsible disclosure from security researchers. Contributors who report valid security issues will be acknowledged in our security advisories.

---

**Last Updated**: 2026-02-02
**Version**: 1.0
