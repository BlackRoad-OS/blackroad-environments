/**
 * BlackRoad Environments
 *
 * Unified API integrations for enterprise-grade environment management.
 *
 * Architecture:
 * - GitHub Projects: Salesforce-like project management
 * - Cloudflare KV: Primary edge state storage
 * - Salesforce CRM: Business data & relationships
 * - Git: File and code management
 *
 * @module @blackroad/environments
 * @license PROPRIETARY
 * @author BlackRoad OS, Inc.
 * @see https://blackroad.io
 */

// Re-export all clients
export * from './clients/index.js';

// Re-export types
export * from './types/index.js';

// Re-export utilities
export * from './utils/hash.js';

// Re-export state management
export { StateManager, createStateManager } from './state/manager.js';
export type { StateManagerConfig, SyncOptions } from './state/manager.js';

// Environment configuration
export { loadConfig, validateConfig } from './utils/config.js';

// Main initialization function
import { clientRegistry } from './clients/base.js';
import { createCloudflareClient, type CloudflareConfig } from './clients/cloudflare.js';
import { createSalesforceClient, type SalesforceConfig } from './clients/salesforce.js';
import { createVercelClient, type VercelConfig } from './clients/vercel.js';
import { createDigitalOceanClient, type DigitalOceanConfig } from './clients/digitalocean.js';
import { createClaudeClient, type ClaudeConfig } from './clients/claude.js';
import { createGitHubClient, type GitHubConfig } from './clients/github.js';
import { createTermiusClient, type TermiusConfig } from './clients/termius.js';
import { createiOSAppManager } from './clients/ios-apps.js';
import { createStateManager, type StateManagerConfig } from './state/manager.js';

export interface BlackRoadConfig {
  cloudflare?: CloudflareConfig;
  salesforce?: SalesforceConfig;
  vercel?: VercelConfig;
  digitalocean?: DigitalOceanConfig;
  claude?: ClaudeConfig;
  github?: GitHubConfig;
  termius?: TermiusConfig;
  stateManager?: Partial<StateManagerConfig>;
}

export interface BlackRoadEnvironment {
  clients: {
    cloudflare?: ReturnType<typeof createCloudflareClient>;
    salesforce?: ReturnType<typeof createSalesforceClient>;
    vercel?: ReturnType<typeof createVercelClient>;
    digitalocean?: ReturnType<typeof createDigitalOceanClient>;
    claude?: ReturnType<typeof createClaudeClient>;
    github?: ReturnType<typeof createGitHubClient>;
    termius?: ReturnType<typeof createTermiusClient>;
    iosApps: ReturnType<typeof createiOSAppManager>;
  };
  state: ReturnType<typeof createStateManager>;
  registry: typeof clientRegistry;
  healthCheck: () => Promise<Map<string, { status: string }>>;
}

/**
 * Initialize BlackRoad environment with all configured services
 */
export function initializeEnvironment(config: BlackRoadConfig): BlackRoadEnvironment {
  const clients: BlackRoadEnvironment['clients'] = {
    iosApps: createiOSAppManager(),
  };

  // Initialize configured clients
  if (config.cloudflare) {
    clients.cloudflare = createCloudflareClient(config.cloudflare);
  }

  if (config.salesforce) {
    clients.salesforce = createSalesforceClient(config.salesforce);
  }

  if (config.vercel) {
    clients.vercel = createVercelClient(config.vercel);
  }

  if (config.digitalocean) {
    clients.digitalocean = createDigitalOceanClient(config.digitalocean);
  }

  if (config.claude) {
    clients.claude = createClaudeClient(config.claude);
  }

  if (config.github) {
    clients.github = createGitHubClient(config.github);
  }

  if (config.termius) {
    clients.termius = createTermiusClient(config.termius);
  }

  // Initialize state manager
  const state = createStateManager(config.stateManager);
  state.initialize({
    cloudflare: clients.cloudflare,
    salesforce: clients.salesforce,
    github: clients.github,
  });

  // Health check function
  const healthCheck = async () => {
    const results = await clientRegistry.healthCheckAll();
    const statusMap = new Map<string, { status: string }>();

    for (const [name, result] of results) {
      statusMap.set(name, {
        status: result.success ? 'healthy' : 'unhealthy',
      });
    }

    return statusMap;
  };

  return {
    clients,
    state,
    registry: clientRegistry,
    healthCheck,
  };
}

// Default export
export default initializeEnvironment;
