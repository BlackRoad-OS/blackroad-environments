# BlackRoad Environments - Agent Instructions

> Comprehensive guide for AI agents working with the BlackRoad Environments repository.

## Overview

This repository provides unified API integrations for enterprise environment management. The architecture follows a Salesforce-like pattern where:

- **GitHub Projects**: Project management and task tracking (like Salesforce Projects)
- **Cloudflare KV/D1**: Primary state storage at the edge
- **Salesforce CRM**: Business data, relationships, and CRM state
- **Git**: Source code and file management

## Agent Todos

### Before Starting Any Task

- [ ] Read and understand the relevant source files
- [ ] Check the current git branch (`claude/setup-projects-api-integration-R4FEY`)
- [ ] Review any existing PR comments or issues
- [ ] Verify API credentials are configured (check `.env.example`)

### Code Quality Checklist

- [ ] Run TypeScript compiler: `npm run typecheck`
- [ ] Run linter: `npm run lint`
- [ ] Run tests: `npm run test`
- [ ] Validate PR: `npm run validate:pr`
- [ ] Verify hashes: `npm run hash dir src`

### PR Submission Checklist

- [ ] All CI checks pass
- [ ] No merge conflicts
- [ ] Commit messages follow conventional format
- [ ] Code coverage meets minimum threshold (80%)
- [ ] Documentation updated if needed
- [ ] Hash integrity verified

---

## Repository Structure

```
blackroad-environments/
├── src/
│   ├── clients/           # API client implementations
│   │   ├── base.ts        # Base client with retry logic
│   │   ├── cloudflare.ts  # Cloudflare KV, D1, Workers
│   │   ├── salesforce.ts  # Salesforce CRM integration
│   │   ├── vercel.ts      # Vercel deployments
│   │   ├── digitalocean.ts # Digital Ocean apps/droplets
│   │   ├── claude.ts      # Claude/Anthropic AI
│   │   ├── github.ts      # GitHub Projects & PRs
│   │   ├── termius.ts     # Termius SSH management
│   │   └── ios-apps.ts    # iOS app URL schemes
│   ├── state/
│   │   └── manager.ts     # State synchronization
│   ├── utils/
│   │   ├── hash.ts        # SHA-256/SHA-infinity hashing
│   │   └── config.ts      # Configuration loading
│   ├── agents/
│   │   └── config.ts      # Agent presets and task queue
│   ├── types/
│   │   └── index.ts       # TypeScript type definitions
│   └── index.ts           # Main entry point
├── scripts/
│   ├── validate-pr.js     # PR validation script
│   ├── hash-util.js       # Hashing utilities
│   └── sync-state.js      # State sync script
└── .github/
    └── workflows/         # CI/CD workflows
```

---

## API Integration Guidelines

### 1. Cloudflare Integration

**Purpose**: Primary edge state storage and serverless compute.

**Key Operations**:
```typescript
// Store state with hash verification
await cloudflare.storeState('key', { data: 'value' });

// Retrieve and verify state
const result = await cloudflare.retrieveState('key');
if (result.data?.valid) {
  // Hash matches, data is intact
}

// KV operations
await cloudflare.kvSet('key', 'value');
await cloudflare.kvGet('key');
await cloudflare.kvList('prefix');

// D1 database
await cloudflare.d1Query('SELECT * FROM table WHERE id = ?', [id]);
```

**Todo**: Always verify hash integrity when retrieving state.

### 2. Salesforce CRM Integration

**Purpose**: Business data, CRM state, and cross-platform data sync.

**Key Operations**:
```typescript
// Authenticate
await salesforce.authenticate();

// SOQL queries
const accounts = await salesforce.query('SELECT Id, Name FROM Account');

// CRUD operations
await salesforce.create('Account', { Name: 'New Account' });
await salesforce.update('Account', id, { Name: 'Updated' });

// Get full CRM state snapshot
const crmState = await salesforce.getCRMState();

// Sync state to custom object
await salesforce.syncState('environments', stateData);
```

**Todo**: Sync CRM state after significant operations.

### 3. GitHub Projects Integration

**Purpose**: Salesforce-like project management in GitHub.

**Key Operations**:
```typescript
// Get project with all fields and items
const project = await github.getProject(projectNumber);

// Create and update project items
await github.createProjectItem(projectId, contentId);
await github.updateProjectItemField(projectId, itemId, fieldId, value);

// PR operations
const pr = await github.getPR(prNumber);
await github.createPR(title, head, base, body);

// Validate PR readiness
const validation = await github.validatePR(prNumber);
if (!validation.data?.valid) {
  console.log('Blockers:', validation.data?.blockers);
}
```

**Todo**: Always validate PRs before attempting merge.

### 4. Vercel/Digital Ocean Deployments

**Purpose**: Multi-cloud deployment orchestration.

**Key Operations**:
```typescript
// Deploy to Vercel
await vercel.deploy({
  projectId: 'proj_xxx',
  environment: 'preview',
  branch: 'feature-branch',
});

// Deploy to Digital Ocean App Platform
await digitalocean.deploy({
  projectId: 'app_xxx',
  environment: 'production',
});

// Check deployment status
const deployment = await vercel.getDeployment(deploymentId);
```

**Todo**: Monitor deployments and handle rollbacks on failure.

### 5. Claude AI Integration

**Purpose**: AI-powered automation and code analysis.

**Key Operations**:
```typescript
// Simple completion
const response = await claude.complete('Analyze this code');

// Multi-turn conversation with tools
const result = await claude.runConversation(prompt, {
  tools: toolDefinitions,
  toolHandlers: handlers,
});

// Code analysis
const analysis = await claude.analyzeCode(code, 'typescript', {
  focus: ['security', 'bugs'],
});

// Generate PR description
const prDesc = await claude.generatePRDescription(gitDiff);
```

**Todo**: Use appropriate temperature for task type (0 for deterministic, 0.3-0.5 for creative).

---

## Hashing Guidelines

### SHA-256 (Standard)
```typescript
import { sha256, hash } from './utils/hash';

// Quick hash
const digest = sha256('data');

// Full hash with salt and iterations
const result = hash('data', {
  algorithm: 'sha256',
  iterations: 100000,
});
```

### SHA-Infinity (Enhanced Security)
```typescript
// SHA-Infinity: Multi-round recursive hashing
const result = hash('sensitive-data', {
  algorithm: 'sha_infinity',
  iterations: 10000,  // Base iterations (scaled per round)
});

// SHA-Infinity applies 7 rounds with:
// - Alternating SHA-256, SHA-384, SHA-512
// - Progressive salt modification
// - Iteration count scaled by 1.5x each round
```

**Todo**: Use SHA-Infinity for sensitive data, SHA-256 for general integrity.

---

## State Management

### Architecture
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Local State   │────▶│  Cloudflare KV  │────▶│   Salesforce    │
│  (.state/local) │     │  (Edge Primary) │     │  (CRM Backup)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                         Hash Verification
```

### Operations
```typescript
const state = createStateManager({
  primaryStorage: 'cloudflare',
  fallbackStorage: 'salesforce',
  conflictResolution: 'latest',
});

state.initialize({ cloudflare, salesforce, github });

// Create records
const record = state.create('deployment', { app: 'myapp', env: 'prod' });

// Sync with remote
const result = await state.sync({ direction: 'bidirectional' });

// Check status
const status = state.getSyncStatus();
```

**Todo**:
- [ ] Sync state before and after deployments
- [ ] Verify hash integrity on critical operations
- [ ] Handle conflicts according to configured strategy

---

## PR Validation

### Automated Checks
1. **TypeScript**: No type errors
2. **ESLint**: No lint violations
3. **Tests**: All pass with ≥80% coverage
4. **Merge Conflicts**: None detected
5. **Commit Messages**: Follow conventional format
6. **Required Files**: package.json, tsconfig.json, LICENSE present
7. **Hash Integrity**: Changed files hash verified

### Running Validation
```bash
# Full validation
npm run validate:pr

# Individual checks
npm run typecheck
npm run lint
npm run test

# Hash verification
npm run hash dir src
```

### Commit Message Format
```
<type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
```

**Todo**: Run `npm run validate:pr` before every PR submission.

---

## iOS App Integration

### Working Copy (Git)
```typescript
const wc = new WorkingCopyClient({ key: 'your-key' });

// Clone repository
const url = wc.cloneRepo('https://github.com/owner/repo');

// Commit changes
const commitUrl = wc.commit('repo-name', 'feat: add feature');
```

### Shellfish (SSH)
```typescript
const sf = new ShellfishClient();

// Connect to server
const url = sf.connect({
  host: 'server.example.com',
  port: 22,
  username: 'user',
  command: 'ls -la',
});
```

### iSH (Linux Shell)
```typescript
const ish = new iSHClient();

// Generate setup script
const script = ish.generateSetupScript();
```

### Pyto (Python)
```typescript
const pyto = new PytoClient();

// Run script
const url = pyto.runScript('/path/to/script.py', ['--arg1', 'value']);
```

---

## Agent Presets

### Available Presets
- **codeReview**: Analyze code changes for issues
- **prValidation**: Validate PR readiness
- **stateSync**: Synchronize state across platforms
- **deployment**: Orchestrate deployments
- **documentation**: Generate and update docs
- **issueTriage**: Categorize and prioritize issues

### Using Presets
```typescript
import { createAgentConfig, AGENT_PRESETS } from './agents/config';

const config = createAgentConfig('prValidation', {
  maxTokens: 8192,  // Override defaults
});
```

---

## Common Tasks

### Task 1: Validate and Submit PR
```bash
# 1. Ensure branch is up to date
git fetch origin main
git rebase origin/main

# 2. Run validation
npm run validate:pr

# 3. Commit with proper message
git commit -m "feat(api): add cloudflare integration"

# 4. Push and create PR
git push -u origin claude/setup-projects-api-integration-R4FEY
```

### Task 2: Sync State
```bash
# Check status
npm run sync:state status

# Pull remote changes
npm run sync:state pull

# Push local changes
npm run sync:state push

# Full bidirectional sync
npm run sync:state sync
```

### Task 3: Generate Hashes
```bash
# Hash data
npm run hash -- hash "my data"

# Hash file
npm run hash -- file package.json

# Hash directory
npm run hash -- dir src --json

# Use SHA-Infinity
npm run hash -- hash "sensitive" --algorithm sha_infinity
```

---

## Error Handling

### API Errors
All clients use exponential backoff with jitter:
- Base delay: 1000ms
- Max delay: 30000ms
- Max retries: 3
- Exponential base: 2

### Retryable Errors
- Network timeouts
- Connection refused
- Rate limiting (429)
- Server errors (502, 503, 504)

### Non-Retryable Errors
- Authentication failures (401)
- Not found (404)
- Bad request (400)

---

## Environment Variables

See `.env.example` for full list. Required for each service:

| Service | Required Variables |
|---------|-------------------|
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Salesforce | `SALESFORCE_USERNAME`, `SALESFORCE_PASSWORD`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` |
| Vercel | `VERCEL_TOKEN` |
| Digital Ocean | `DIGITALOCEAN_TOKEN` |
| Claude | `ANTHROPIC_API_KEY` |
| GitHub | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` |
| Termius | `TERMIUS_API_KEY` |

---

## Summary Checklist for Agents

### Before Every Task
- [ ] Understand the task requirements
- [ ] Check git status and branch
- [ ] Review relevant code files
- [ ] Verify API credentials

### During Task Execution
- [ ] Follow TypeScript best practices
- [ ] Use appropriate hashing for data integrity
- [ ] Handle errors with proper retry logic
- [ ] Keep state synchronized

### After Task Completion
- [ ] Run validation: `npm run validate:pr`
- [ ] Verify hashes: `npm run hash dir src`
- [ ] Sync state: `npm run sync:state sync`
- [ ] Create commit with conventional message
- [ ] Push to correct branch

### PR Submission
- [ ] All checks pass
- [ ] No merge conflicts
- [ ] Documentation updated
- [ ] Ready for review

---

*This document is auto-generated and should be kept in sync with the codebase.*
