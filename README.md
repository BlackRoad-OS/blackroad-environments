# BlackRoad Environments

> Unified API integrations for enterprise environment management across Cloudflare, Salesforce, Vercel, Digital Ocean, Claude AI, GitHub Projects, and mobile ecosystems.

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

## Architecture Overview

BlackRoad Environments implements a Salesforce-like project management pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                    BlackRoad Environments                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   GitHub     │  │  Cloudflare  │  │  Salesforce  │          │
│  │   Projects   │  │   KV / D1    │  │     CRM      │          │
│  │  (Tracking)  │  │   (State)    │  │   (Data)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                  ┌────────▼────────┐                           │
│                  │  State Manager  │                           │
│                  │  (Hash Verified)│                           │
│                  └────────┬────────┘                           │
│                           │                                     │
│  ┌──────────────┬─────────┼─────────┬──────────────┐          │
│  │              │         │         │              │          │
│  ▼              ▼         ▼         ▼              ▼          │
│ Vercel      Digital    Claude    Termius      iOS Apps       │
│             Ocean        AI       (SSH)        (Git/Shell)   │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Multi-Cloud Deployments**: Vercel, Digital Ocean, Cloudflare Workers
- **CRM Integration**: Full Salesforce SOQL/CRUD operations
- **State Management**: Hash-verified sync across platforms
- **AI Automation**: Claude API integration for code analysis
- **GitHub Projects**: Salesforce-like project boards
- **Mobile Ecosystem**: iOS app URL scheme integrations
- **Security**: SHA-256 and SHA-Infinity hashing

## Installation

```bash
# Clone the repository
git clone https://github.com/BlackRoad-OS/blackroad-environments.git
cd blackroad-environments

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your API keys in .env
```

## Quick Start

```typescript
import { initializeEnvironment } from '@blackroad/environments';

// Initialize with your configuration
const env = initializeEnvironment({
  cloudflare: {
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: 'BlackRoad-OS',
    repo: 'blackroad-environments',
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

// Health check all services
const health = await env.healthCheck();
console.log('Service Health:', health);

// Use state management
env.state.create('deployment', {
  app: 'my-app',
  environment: 'production',
  timestamp: new Date().toISOString(),
});

// Sync with remote storage
await env.state.sync();
```

## API Clients

### Cloudflare
```typescript
const { cloudflare } = env.clients;

// KV Storage
await cloudflare.kvSet('key', 'value');
const result = await cloudflare.kvGet('key');

// D1 Database
await cloudflare.d1Query('SELECT * FROM users WHERE id = ?', [userId]);

// State with hash verification
await cloudflare.storeState('app_state', { data: 'value' });
```

### Salesforce
```typescript
const { salesforce } = env.clients;

// Authenticate
await salesforce.authenticate();

// Query records
const accounts = await salesforce.query(
  'SELECT Id, Name, Type FROM Account LIMIT 100'
);

// CRM state snapshot
const crmState = await salesforce.getCRMState();
```

### GitHub Projects
```typescript
const { github } = env.clients;

// Get project board
const project = await github.getProject(1);

// Validate PR
const validation = await github.validatePR(123);
if (!validation.data?.valid) {
  console.log('Blockers:', validation.data?.blockers);
}

// Create issue
await github.createIssue('Bug: Something broke', 'Description here', {
  labels: ['bug', 'priority-high'],
});
```

### Vercel
```typescript
const { vercel } = env.clients;

// Deploy
const deployment = await vercel.deploy({
  projectId: 'my-project',
  environment: 'preview',
  branch: 'feature-branch',
});

// Check status
const status = await vercel.getDeployment(deployment.data?.id);
```

### Claude AI
```typescript
const { claude } = env.clients;

// Simple completion
const response = await claude.complete('Explain this code');

// Code analysis
const analysis = await claude.analyzeCode(code, 'typescript', {
  focus: ['security', 'performance'],
});

// Generate PR description
const prDesc = await claude.generatePRDescription(gitDiff);
```

## Hashing

### SHA-256 (Standard)
```typescript
import { sha256, hash } from '@blackroad/environments';

const digest = sha256('data');

const result = hash('data', {
  algorithm: 'sha256',
  iterations: 100000,
});
```

### SHA-Infinity (Enhanced)
```typescript
// Multi-round recursive hashing with progressive salt modification
const result = hash('sensitive-data', {
  algorithm: 'sha_infinity',
  iterations: 10000,
});

// SHA-Infinity applies 7 rounds with:
// - Alternating SHA-256/384/512 algorithms
// - Round-specific salt modification
// - Scaled iteration counts (1.5x per round)
```

## State Management

```typescript
const state = env.state;

// Create records
const record = state.create('config', { key: 'value' });

// Query records
const configs = state.getByType('config');

// Sync with remote
const result = await state.sync({
  direction: 'bidirectional',
  force: false,
});

// Get status
const status = state.getSyncStatus();
console.log(`Pending sync: ${status.pendingSync}`);
```

## CLI Scripts

```bash
# Validate PR before submission
npm run validate:pr

# Hash utilities
npm run hash -- hash "data"
npm run hash -- file package.json
npm run hash -- dir src --algorithm sha_infinity

# State synchronization
npm run sync:state status
npm run sync:state push
npm run sync:state pull
npm run sync:state export backup.json
```

## iOS App Integration

```typescript
const { iosApps } = env.clients;

// Working Copy (Git)
const cloneUrl = iosApps.workingCopy.cloneRepo('https://github.com/org/repo');
const commitUrl = iosApps.workingCopy.commit('repo', 'feat: add feature');

// Shellfish (SSH)
const sshUrl = iosApps.shellfish.connect({
  host: 'server.example.com',
  username: 'user',
  command: 'ls -la',
});

// iSH (Linux Shell)
const setupScript = iosApps.ish.generateSetupScript();

// Pyto (Python)
const runUrl = iosApps.pyto.runScript('/path/to/script.py');
```

## Configuration

See `.env.example` for all configuration options:

| Category | Variables |
|----------|-----------|
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` |
| Salesforce | `SALESFORCE_USERNAME`, `SALESFORCE_PASSWORD`, `SALESFORCE_CLIENT_ID` |
| Vercel | `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` |
| Digital Ocean | `DIGITALOCEAN_TOKEN`, `DIGITALOCEAN_APP_ID` |
| Claude | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` |
| GitHub | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` |
| Termius | `TERMIUS_API_KEY` |

## Development

```bash
# Build
npm run build

# Development mode (watch)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:coverage

# Full validation
npm run validate
```

## Agent Instructions

See [AGENTS.md](./AGENTS.md) for comprehensive instructions on:
- Repository structure
- API integration guidelines
- Hashing best practices
- State management
- PR validation checklist
- Common task workflows

## License

Proprietary - BlackRoad OS, Inc.

See [LICENSE](./LICENSE) for details.

## Contact

- Email: blackroad.systems@gmail.com
- Website: https://blackroad.io
