/**
 * BlackRoad Environments - Client Exports
 *
 * Unified exports for all API clients and utilities.
 */

// Base client and registry
export { BaseAPIClient, ClientRegistry, clientRegistry } from './base.js';

// Cloud providers
export { CloudflareClient, createCloudflareClient } from './cloudflare.js';
export type { CloudflareConfig } from './cloudflare.js';

export { VercelClient, createVercelClient } from './vercel.js';
export type { VercelConfig, VercelProject, VercelDeployment, VercelEnvVar } from './vercel.js';

export { DigitalOceanClient, createDigitalOceanClient } from './digitalocean.js';
export type { DigitalOceanConfig, DOApp, DODeployment, DODroplet } from './digitalocean.js';

// CRM & Business
export { SalesforceClient, createSalesforceClient } from './salesforce.js';
export type { SalesforceConfig } from './salesforce.js';

// AI
export { ClaudeClient, createClaudeClient } from './claude.js';
export type { ClaudeConfig, ClaudeMessage, ClaudeResponse, ClaudeToolDefinition } from './claude.js';

// DevOps
export { GitHubClient, createGitHubClient } from './github.js';
export type { GitHubConfig, GitHubIssue, GitHubPR, GitHubCheckRun } from './github.js';

export { TermiusClient, createTermiusClient } from './termius.js';
export type { TermiusConfig, TermiusHost, TermiusGroup, TermiusSSHKey } from './termius.js';

// iOS Apps
export {
  WorkingCopyClient,
  ShellfishClient,
  iSHClient,
  PytoClient,
  iOSAppManager,
  createiOSAppManager,
} from './ios-apps.js';
export type { WorkingCopyConfig, ShellfishConfig, iSHConfig, PytoConfig } from './ios-apps.js';
