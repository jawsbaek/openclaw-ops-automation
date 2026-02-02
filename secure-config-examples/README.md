# Secure Configuration Examples

This directory contains security-hardened configuration templates for the OpenClaw Ops Automation system.

## ⚠️ Important Security Notes

1. **Never commit secrets to version control**
   - Use `.env` for sensitive values
   - Add `.env` to `.gitignore`
   - Only commit `.env.example` templates

2. **Use strong, randomly generated secrets**
   - Generate tokens: `openssl rand -hex 32`
   - Generate secrets: `openssl rand -base64 32`
   - Rotate secrets regularly

3. **Principle of least privilege**
   - Assign minimal necessary permissions
   - Use RBAC to restrict access
   - Require approval for destructive actions

## Files

### `.env.example`
Template for environment variables. Copy to `.env` and fill in actual values.

```bash
cp .env.example .env
# Edit .env with your values
# Generate secrets:
openssl rand -hex 32  # For WEBHOOK_AUTH_TOKEN
openssl rand -base64 32  # For WEBHOOK_SECRET
```

### `autoheal-playbooks.secure.json`
Security-hardened AutoHeal playbook configuration:
- Uses whitelisted command IDs instead of raw shell commands
- Includes permission requirements
- Specifies approval requirements for critical actions
- Includes timeout and verification settings

**Key improvements over default:**
- ✅ Command injection protection (whitelisted commands only)
- ✅ RBAC integration (required_permission field)
- ✅ Approval workflow for destructive actions
- ✅ Command timeouts to prevent hanging
- ✅ Verification steps to ensure actions succeeded

**Usage:**
```bash
cp secure-config-examples/autoheal-playbooks.secure.json config/autoheal-playbooks.json
```

### `monitoring-sources.secure.json`
Security-hardened monitoring configuration:
- Environment variable substitution for credentials
- TLS/HTTPS configuration
- Rate limiting settings
- Webhook authentication
- Log sanitization enabled

**Key improvements over default:**
- ✅ No hardcoded credentials (uses ${ENV_VAR} syntax)
- ✅ TLS enabled for all connections
- ✅ Authentication required for webhooks
- ✅ Rate limiting configured
- ✅ Security event patterns defined
- ✅ Log sanitization enabled

**Usage:**
```bash
cp secure-config-examples/monitoring-sources.secure.json config/monitoring-sources.json
# Make sure .env is configured with actual values
```

### `rbac.example.json`
Role-Based Access Control configuration:
- Predefined roles (viewer, operator, incident_responder, admin)
- Permission assignments for agents and users
- Approval policies
- Rate limits per role

**Key features:**
- ✅ Granular permissions (read:*, execute:*, spawn:*, etc.)
- ✅ Role hierarchy (viewer < operator < incident_responder < admin)
- ✅ Approval requirements for critical actions
- ✅ Audit logging for all privileged operations
- ✅ Rate limiting per role

**Usage:**
```bash
cp secure-config-examples/rbac.example.json config/rbac.json
# Review and customize roles/assignments for your org
```

## Quick Setup

```bash
#!/bin/bash
# Run this from the ops-automation directory

# 1. Copy secure configs
echo "📋 Copying secure configuration templates..."
cp secure-config-examples/autoheal-playbooks.secure.json config/autoheal-playbooks.json
cp secure-config-examples/monitoring-sources.secure.json config/monitoring-sources.json
cp secure-config-examples/rbac.example.json config/rbac.json

# 2. Create .env with generated secrets
echo "🔐 Creating .env file with secure secrets..."
cp secure-config-examples/.env.example .env

# Generate secrets
WEBHOOK_TOKEN=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 64)

# Update .env (macOS sed syntax)
sed -i '' "s/generate-with-openssl-rand-hex-32/$WEBHOOK_TOKEN/g" .env
sed -i '' "s/generate-with-openssl-rand-base64-32/$WEBHOOK_SECRET/g" .env
sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/g" .env
sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/g" .env

echo "✅ Secure configuration setup complete!"
echo ""
echo "⚠️  Next steps:"
echo "1. Review and update .env with your actual endpoints and credentials"
echo "2. Review config/rbac.json and customize roles/permissions"
echo "3. Review config/autoheal-playbooks.json and adjust as needed"
echo "4. Test authentication: npm run test:security"
echo ""
echo "🔒 Security reminders:"
echo "- Never commit .env to version control"
echo "- Rotate secrets regularly (every 90 days)"
echo "- Use TLS/HTTPS in production"
echo "- Review audit logs regularly"
echo "- Keep dependencies updated (npm audit)"
```

## Configuration Comparison

### Before (Insecure)
```json
{
  "prometheus": {
    "endpoint": "http://localhost:9090"
  },
  "actions": [
    {
      "type": "shell",
      "command": "find /tmp -type f -mtime +7 -delete"
    }
  ]
}
```

**Problems:**
- ❌ HTTP instead of HTTPS
- ❌ No authentication
- ❌ Raw shell commands (injection risk)
- ❌ No permission checks
- ❌ No approval workflow

### After (Secure)
```json
{
  "prometheus": {
    "endpoint": "${PROMETHEUS_URL}",
    "username": "${PROMETHEUS_USER}",
    "password": "${PROMETHEUS_PASSWORD}",
    "tls": {
      "enabled": true,
      "verify": true
    }
  },
  "actions": [
    {
      "commandId": "cleanup_tmp",
      "params": { "days": "7" },
      "required_permission": "execute:disk_cleanup",
      "requires_approval": false
    }
  ]
}
```

**Improvements:**
- ✅ HTTPS with TLS verification
- ✅ Credentials from environment variables
- ✅ Whitelisted commands only
- ✅ RBAC permission checks
- ✅ Optional approval workflow
- ✅ Validated parameters

## Testing

After applying secure configurations:

```bash
# 1. Validate configuration files
npm run validate:config

# 2. Test authentication
npm run test:auth

# 3. Test RBAC
npm run test:rbac

# 4. Test command whitelisting
npm run test:commands

# 5. Full security test suite
npm run test:security
```

## Migration from Existing Config

If you have existing configurations:

```bash
# 1. Backup current config
cp config/autoheal-playbooks.json config/autoheal-playbooks.backup.json
cp config/monitoring-sources.json config/monitoring-sources.backup.json

# 2. Apply secure templates
cp secure-config-examples/*.json config/

# 3. Review differences
diff config/autoheal-playbooks.backup.json config/autoheal-playbooks.json

# 4. Manually merge any custom playbooks/settings
# Use the secure format as a template

# 5. Test thoroughly before production
npm run test:all
```

## Production Checklist

Before deploying secure configurations to production:

- [ ] All secrets generated and stored in `.env`
- [ ] `.env` added to `.gitignore`
- [ ] TLS certificates generated and configured
- [ ] RBAC roles reviewed and customized
- [ ] Approval workflows tested
- [ ] Rate limiting configured appropriately
- [ ] Audit logging verified
- [ ] Command whitelist includes all needed commands
- [ ] Permissions assigned to all agents/users
- [ ] Security tests passing
- [ ] Monitoring configured for security events
- [ ] Incident response plan documented
- [ ] Team trained on new security features

## Support

For questions or issues:
- Review `SECURITY.md` for security policies
- Review `security-review-report.md` for detailed findings
- Review `security-enhancements.md` for implementation guides
- Report security issues privately (see `SECURITY.md`)

---

**Version**: 1.0  
**Last Updated**: 2026-02-02  
**Maintained by**: Security Team
