/**
 * BlackRoad Environments - Core Types
 *
 * Unified type definitions for all API integrations and state management
 */

import { z } from 'zod';

// ============================================
// API Client Types
// ============================================

export interface APIClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: ResponseMetadata;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: number;
  duration: number;
  hash?: string;
}

// ============================================
// State Management Types
// ============================================

export const StateRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  hash: z.string(),
  version: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  syncedTo: z.array(z.enum(['cloudflare', 'salesforce', 'github'])),
});

export type StateRecord = z.infer<typeof StateRecordSchema>;

export interface StateSyncResult {
  success: boolean;
  synced: string[];
  failed: string[];
  conflicts: StateConflict[];
}

export interface StateConflict {
  recordId: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolution?: 'local' | 'remote' | 'merge';
}

// ============================================
// GitHub Projects Types
// ============================================

export interface GitHubProject {
  id: string;
  number: number;
  title: string;
  description?: string;
  url: string;
  closed: boolean;
  fields: ProjectField[];
  items: ProjectItem[];
}

export interface ProjectField {
  id: string;
  name: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'ITERATION';
  options?: { id: string; name: string; color?: string }[];
}

export interface ProjectItem {
  id: string;
  type: 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE';
  title: string;
  status?: string;
  priority?: string;
  assignees: string[];
  labels: string[];
  fieldValues: Record<string, unknown>;
}

// ============================================
// Salesforce CRM Types
// ============================================

export interface SalesforceRecord {
  Id: string;
  Name?: string;
  attributes: {
    type: string;
    url: string;
  };
  [key: string]: unknown;
}

export interface SalesforceQueryResult<T extends SalesforceRecord = SalesforceRecord> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface CRMState {
  accounts: SalesforceRecord[];
  contacts: SalesforceRecord[];
  opportunities: SalesforceRecord[];
  customObjects: Record<string, SalesforceRecord[]>;
  lastSync: string;
  hash: string;
}

// ============================================
// Cloudflare Types
// ============================================

export interface CloudflareKVEntry {
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  expiration?: number;
}

export interface CloudflareD1Result {
  success: boolean;
  results: Record<string, unknown>[];
  meta: {
    duration: number;
    changes: number;
  };
}

export interface CloudflareWorkerState {
  id: string;
  name: string;
  deployed: boolean;
  routes: string[];
  bindings: WorkerBinding[];
}

export interface WorkerBinding {
  type: 'kv' | 'd1' | 'r2' | 'service' | 'secret';
  name: string;
  id?: string;
}

// ============================================
// Deployment Types (Vercel/DO)
// ============================================

export interface DeploymentConfig {
  provider: 'vercel' | 'digitalocean' | 'cloudflare';
  projectId: string;
  environment: 'production' | 'preview' | 'development';
  branch?: string;
  env?: Record<string, string>;
}

export interface DeploymentResult {
  id: string;
  url: string;
  status: 'building' | 'ready' | 'error' | 'canceled';
  createdAt: string;
  readyAt?: string;
  error?: string;
}

// ============================================
// Agent Types
// ============================================

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  tools: AgentTool[];
  retryPolicy: RetryPolicy;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: unknown) => Promise<unknown>;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
}

export interface AgentTask {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  description: string;
  dependencies: string[];
  assignedAgent?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

// ============================================
// iOS App Integration Types
// ============================================

export interface iOSAppConfig {
  app: 'working_copy' | 'shellfish' | 'ish' | 'pyto';
  urlScheme: string;
  callbackUrl?: string;
  sharedDirectory?: string;
}

export interface WorkingCopyAction {
  action: 'clone' | 'pull' | 'push' | 'commit' | 'open';
  repo?: string;
  branch?: string;
  path?: string;
  message?: string;
}

export interface ShellfishConnection {
  host: string;
  port: number;
  username: string;
  keyName?: string;
  command?: string;
}

// ============================================
// Hashing Types
// ============================================

export interface HashOptions {
  algorithm: 'sha256' | 'sha384' | 'sha512' | 'sha_infinity';
  iterations?: number;
  salt?: string;
  encoding?: 'hex' | 'base64' | 'base64url';
}

export interface HashResult {
  hash: string;
  algorithm: string;
  iterations: number;
  salt: string;
  timestamp: number;
}

export interface HashVerification {
  valid: boolean;
  hash: HashResult;
  input: string;
}

// ============================================
// PR Validation Types
// ============================================

export interface PRValidationConfig {
  requireTests: boolean;
  requireTypecheck: boolean;
  requireLint: boolean;
  minCoverage: number;
  requiredReviewers: number;
  allowedMergeStrategies: ('merge' | 'squash' | 'rebase')[];
  branchProtection: BranchProtection;
}

export interface BranchProtection {
  protectedBranches: string[];
  requireSignedCommits: boolean;
  requireLinearHistory: boolean;
  allowForcePush: boolean;
  allowDeletions: boolean;
}

export interface PRValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  blockers: string[];
  warnings: string[];
  hash: string;
}

export interface ValidationCheck {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  message?: string;
  duration?: number;
}
