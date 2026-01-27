/**
 * BlackRoad Environments - Configuration Utilities
 *
 * Load and validate environment configuration from various sources.
 */

import { z } from 'zod';

// Configuration schema
const ConfigSchema = z.object({
  // Cloudflare
  cloudflare: z.object({
    apiKey: z.string().optional(),
    accountId: z.string().optional(),
    zoneId: z.string().optional(),
    kvNamespaceId: z.string().optional(),
    d1DatabaseId: z.string().optional(),
    r2BucketName: z.string().optional(),
  }).optional(),

  // Salesforce
  salesforce: z.object({
    loginUrl: z.string().url().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    securityToken: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    instanceUrl: z.string().url().optional(),
  }).optional(),

  // Vercel
  vercel: z.object({
    token: z.string().optional(),
    teamId: z.string().optional(),
    projectId: z.string().optional(),
  }).optional(),

  // Digital Ocean
  digitalocean: z.object({
    token: z.string().optional(),
    spacesKey: z.string().optional(),
    spacesSecret: z.string().optional(),
    spacesEndpoint: z.string().optional(),
    appId: z.string().optional(),
  }).optional(),

  // Claude
  claude: z.object({
    apiKey: z.string().optional(),
    model: z.string().optional(),
    maxTokens: z.number().optional(),
  }).optional(),

  // GitHub
  github: z.object({
    token: z.string().optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    projectNumber: z.number().optional(),
  }).optional(),

  // Termius
  termius: z.object({
    apiKey: z.string().optional(),
    teamId: z.string().optional(),
  }).optional(),

  // State Management
  stateManager: z.object({
    syncIntervalMs: z.number().optional(),
    primaryStorage: z.enum(['cloudflare', 'salesforce']).optional(),
    fallbackStorage: z.enum(['cloudflare', 'salesforce']).optional(),
    encryptionKey: z.string().optional(),
    conflictResolution: z.enum(['local', 'remote', 'manual', 'latest']).optional(),
  }).optional(),

  // Hashing
  hashing: z.object({
    algorithm: z.enum(['sha256', 'sha384', 'sha512', 'sha_infinity']).optional(),
    iterations: z.number().optional(),
    saltLength: z.number().optional(),
  }).optional(),

  // Agent
  agent: z.object({
    maxRetries: z.number().optional(),
    timeoutMs: z.number().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  }).optional(),

  // PR Validation
  prValidation: z.object({
    requireTests: z.boolean().optional(),
    requireTypecheck: z.boolean().optional(),
    requireLint: z.boolean().optional(),
    minCoverage: z.number().optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const env = process.env;

  return {
    cloudflare: {
      apiKey: env['CLOUDFLARE_API_TOKEN'],
      accountId: env['CLOUDFLARE_ACCOUNT_ID'],
      zoneId: env['CLOUDFLARE_ZONE_ID'],
      kvNamespaceId: env['CLOUDFLARE_KV_NAMESPACE_ID'],
      d1DatabaseId: env['CLOUDFLARE_D1_DATABASE_ID'],
      r2BucketName: env['CLOUDFLARE_R2_BUCKET_NAME'],
    },
    salesforce: {
      loginUrl: env['SALESFORCE_LOGIN_URL'],
      username: env['SALESFORCE_USERNAME'],
      password: env['SALESFORCE_PASSWORD'],
      securityToken: env['SALESFORCE_SECURITY_TOKEN'],
      clientId: env['SALESFORCE_CLIENT_ID'],
      clientSecret: env['SALESFORCE_CLIENT_SECRET'],
      instanceUrl: env['SALESFORCE_INSTANCE_URL'],
    },
    vercel: {
      token: env['VERCEL_TOKEN'],
      teamId: env['VERCEL_TEAM_ID'],
      projectId: env['VERCEL_PROJECT_ID'],
    },
    digitalocean: {
      token: env['DIGITALOCEAN_TOKEN'],
      spacesKey: env['DIGITALOCEAN_SPACES_KEY'],
      spacesSecret: env['DIGITALOCEAN_SPACES_SECRET'],
      spacesEndpoint: env['DIGITALOCEAN_SPACES_ENDPOINT'],
      appId: env['DIGITALOCEAN_APP_ID'],
    },
    claude: {
      apiKey: env['ANTHROPIC_API_KEY'],
      model: env['CLAUDE_MODEL'],
      maxTokens: env['CLAUDE_MAX_TOKENS'] ? parseInt(env['CLAUDE_MAX_TOKENS'], 10) : undefined,
    },
    github: {
      token: env['GITHUB_TOKEN'],
      owner: env['GITHUB_OWNER'],
      repo: env['GITHUB_REPO'],
      projectNumber: env['GITHUB_PROJECT_NUMBER'] ? parseInt(env['GITHUB_PROJECT_NUMBER'], 10) : undefined,
    },
    termius: {
      apiKey: env['TERMIUS_API_KEY'],
      teamId: env['TERMIUS_TEAM_ID'],
    },
    stateManager: {
      syncIntervalMs: env['STATE_SYNC_INTERVAL_MS'] ? parseInt(env['STATE_SYNC_INTERVAL_MS'], 10) : undefined,
      primaryStorage: env['STATE_STORAGE_PRIMARY'] as 'cloudflare' | 'salesforce' | undefined,
      fallbackStorage: env['STATE_STORAGE_FALLBACK'] as 'cloudflare' | 'salesforce' | undefined,
      encryptionKey: env['STATE_ENCRYPTION_KEY'],
      conflictResolution: env['STATE_CONFLICT_RESOLUTION'] as 'local' | 'remote' | 'manual' | 'latest' | undefined,
    },
    hashing: {
      algorithm: env['HASH_ALGORITHM'] as 'sha256' | 'sha384' | 'sha512' | 'sha_infinity' | undefined,
      iterations: env['HASH_ITERATIONS'] ? parseInt(env['HASH_ITERATIONS'], 10) : undefined,
      saltLength: env['HASH_SALT_LENGTH'] ? parseInt(env['HASH_SALT_LENGTH'], 10) : undefined,
    },
    agent: {
      maxRetries: env['AGENT_MAX_RETRIES'] ? parseInt(env['AGENT_MAX_RETRIES'], 10) : undefined,
      timeoutMs: env['AGENT_TIMEOUT_MS'] ? parseInt(env['AGENT_TIMEOUT_MS'], 10) : undefined,
      logLevel: env['AGENT_LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error' | undefined,
    },
    prValidation: {
      requireTests: env['PR_REQUIRE_TESTS'] === 'true',
      requireTypecheck: env['PR_REQUIRE_TYPECHECK'] === 'true',
      requireLint: env['PR_REQUIRE_LINT'] === 'true',
      minCoverage: env['PR_MIN_COVERAGE'] ? parseInt(env['PR_MIN_COVERAGE'], 10) : undefined,
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { valid: false, errors };
}

/**
 * Check which services are configured
 */
export function getConfiguredServices(config: Config): string[] {
  const services: string[] = [];

  if (config.cloudflare?.apiKey && config.cloudflare?.accountId) {
    services.push('cloudflare');
  }

  if (config.salesforce?.username && config.salesforce?.password) {
    services.push('salesforce');
  }

  if (config.vercel?.token) {
    services.push('vercel');
  }

  if (config.digitalocean?.token) {
    services.push('digitalocean');
  }

  if (config.claude?.apiKey) {
    services.push('claude');
  }

  if (config.github?.token) {
    services.push('github');
  }

  if (config.termius?.apiKey) {
    services.push('termius');
  }

  return services;
}

/**
 * Get missing required configuration for a service
 */
export function getMissingConfig(service: string, config: Config): string[] {
  const missing: string[] = [];

  switch (service) {
    case 'cloudflare':
      if (!config.cloudflare?.apiKey) missing.push('CLOUDFLARE_API_TOKEN');
      if (!config.cloudflare?.accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
      break;

    case 'salesforce':
      if (!config.salesforce?.username) missing.push('SALESFORCE_USERNAME');
      if (!config.salesforce?.password) missing.push('SALESFORCE_PASSWORD');
      if (!config.salesforce?.clientId) missing.push('SALESFORCE_CLIENT_ID');
      if (!config.salesforce?.clientSecret) missing.push('SALESFORCE_CLIENT_SECRET');
      break;

    case 'vercel':
      if (!config.vercel?.token) missing.push('VERCEL_TOKEN');
      break;

    case 'digitalocean':
      if (!config.digitalocean?.token) missing.push('DIGITALOCEAN_TOKEN');
      break;

    case 'claude':
      if (!config.claude?.apiKey) missing.push('ANTHROPIC_API_KEY');
      break;

    case 'github':
      if (!config.github?.token) missing.push('GITHUB_TOKEN');
      if (!config.github?.owner) missing.push('GITHUB_OWNER');
      if (!config.github?.repo) missing.push('GITHUB_REPO');
      break;

    case 'termius':
      if (!config.termius?.apiKey) missing.push('TERMIUS_API_KEY');
      break;
  }

  return missing;
}

export default loadConfig;
