/**
 * BlackRoad Environments - State Management System
 *
 * Unified state synchronization across:
 * - Cloudflare KV (primary edge storage)
 * - Salesforce CRM (business data & relationships)
 * - GitHub Projects (project tracking)
 *
 * Design: Salesforce-like project management in GitHub,
 * with CRM and Cloudflare holding state/details,
 * while Git manages files.
 */

import type {
  StateRecord,
  StateSyncResult,
  StateConflict,
  CRMState,
} from '../types/index.js';
import { hashState, sha256, hashId } from '../utils/hash.js';
import type { CloudflareClient } from '../clients/cloudflare.js';
import type { SalesforceClient } from '../clients/salesforce.js';
import type { GitHubClient } from '../clients/github.js';

export interface StateManagerConfig {
  syncIntervalMs?: number;
  primaryStorage: 'cloudflare' | 'salesforce';
  fallbackStorage: 'cloudflare' | 'salesforce';
  encryptionKey?: string;
  conflictResolution: 'local' | 'remote' | 'manual' | 'latest';
}

export interface SyncOptions {
  force?: boolean;
  direction?: 'push' | 'pull' | 'bidirectional';
  includeTypes?: string[];
  excludeTypes?: string[];
}

interface StoredState {
  records: Map<string, StateRecord>;
  lastSync: string;
  hash: string;
}

export class StateManager {
  private readonly config: Required<StateManagerConfig>;
  private cloudflare: CloudflareClient | null = null;
  private salesforce: SalesforceClient | null = null;
  private github: GitHubClient | null = null;

  private localState: StoredState = {
    records: new Map(),
    lastSync: '',
    hash: '',
  };

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = {
      syncIntervalMs: config.syncIntervalMs ?? 30000,
      primaryStorage: config.primaryStorage ?? 'cloudflare',
      fallbackStorage: config.fallbackStorage ?? 'salesforce',
      encryptionKey: config.encryptionKey ?? '',
      conflictResolution: config.conflictResolution ?? 'latest',
    };
  }

  /**
   * Initialize with API clients
   */
  initialize(clients: {
    cloudflare?: CloudflareClient;
    salesforce?: SalesforceClient;
    github?: GitHubClient;
  }): void {
    this.cloudflare = clients.cloudflare ?? null;
    this.salesforce = clients.salesforce ?? null;
    this.github = clients.github ?? null;
  }

  /**
   * Start automatic sync
   */
  startAutoSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(async () => {
      await this.sync({ direction: 'bidirectional' });
    }, this.config.syncIntervalMs);

    // Initial sync
    this.sync({ direction: 'pull' });
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // ============================================
  // State Record Operations
  // ============================================

  /**
   * Create a new state record
   */
  create(type: string, data: Record<string, unknown>): StateRecord {
    const now = new Date().toISOString();
    const record: StateRecord = {
      id: hashId(`${type}`),
      type,
      data,
      hash: hashState(data),
      version: 1,
      createdAt: now,
      updatedAt: now,
      syncedTo: [],
    };

    this.localState.records.set(record.id, record);
    this.updateLocalHash();

    return record;
  }

  /**
   * Get a state record by ID
   */
  get(id: string): StateRecord | undefined {
    return this.localState.records.get(id);
  }

  /**
   * Get all records of a type
   */
  getByType(type: string): StateRecord[] {
    return Array.from(this.localState.records.values())
      .filter(r => r.type === type);
  }

  /**
   * Update a state record
   */
  update(id: string, data: Partial<Record<string, unknown>>): StateRecord | null {
    const record = this.localState.records.get(id);
    if (!record) return null;

    const updatedData = { ...record.data, ...data };
    const updated: StateRecord = {
      ...record,
      data: updatedData,
      hash: hashState(updatedData),
      version: record.version + 1,
      updatedAt: new Date().toISOString(),
      syncedTo: [], // Mark as needing sync
    };

    this.localState.records.set(id, updated);
    this.updateLocalHash();

    return updated;
  }

  /**
   * Delete a state record
   */
  delete(id: string): boolean {
    const deleted = this.localState.records.delete(id);
    if (deleted) {
      this.updateLocalHash();
    }
    return deleted;
  }

  /**
   * Query records with filter
   */
  query(filter: {
    type?: string;
    dataFilter?: (data: Record<string, unknown>) => boolean;
    limit?: number;
    offset?: number;
  }): StateRecord[] {
    let results = Array.from(this.localState.records.values());

    if (filter.type) {
      results = results.filter(r => r.type === filter.type);
    }

    if (filter.dataFilter) {
      results = results.filter(r => filter.dataFilter!(r.data));
    }

    if (filter.offset) {
      results = results.slice(filter.offset);
    }

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Synchronize state with remote storage
   */
  async sync(options: SyncOptions = {}): Promise<StateSyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        synced: [],
        failed: ['Sync already in progress'],
        conflicts: [],
      };
    }

    this.syncInProgress = true;

    try {
      const result: StateSyncResult = {
        success: true,
        synced: [],
        failed: [],
        conflicts: [],
      };

      const direction = options.direction ?? 'bidirectional';

      // Pull from remote
      if (direction === 'pull' || direction === 'bidirectional') {
        const pullResult = await this.pullFromRemote(options);
        result.synced.push(...pullResult.synced);
        result.failed.push(...pullResult.failed);
        result.conflicts.push(...pullResult.conflicts);
      }

      // Push to remote
      if (direction === 'push' || direction === 'bidirectional') {
        const pushResult = await this.pushToRemote(options);
        result.synced.push(...pushResult.synced);
        result.failed.push(...pushResult.failed);
      }

      result.success = result.failed.length === 0;
      this.localState.lastSync = new Date().toISOString();

      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Pull state from remote storage
   */
  private async pullFromRemote(options: SyncOptions): Promise<StateSyncResult> {
    const result: StateSyncResult = {
      success: true,
      synced: [],
      failed: [],
      conflicts: [],
    };

    // Pull from Cloudflare KV
    if (this.cloudflare) {
      try {
        const kvResult = await this.cloudflare.retrieveState('blackroad_state');

        if (kvResult.success && kvResult.data && kvResult.data.valid) {
          const remoteState = kvResult.data.state as { records?: Record<string, StateRecord> };

          if (remoteState.records) {
            for (const [id, remoteRecord] of Object.entries(remoteState.records)) {
              const localRecord = this.localState.records.get(id);

              if (!localRecord) {
                // New record from remote
                this.localState.records.set(id, {
                  ...remoteRecord,
                  syncedTo: ['cloudflare'],
                });
                result.synced.push(`cloudflare:${id}`);
              } else if (remoteRecord.hash !== localRecord.hash) {
                // Conflict detected
                const resolution = this.resolveConflict(localRecord, remoteRecord);
                result.conflicts.push({
                  recordId: id,
                  field: 'data',
                  localValue: localRecord.data,
                  remoteValue: remoteRecord.data,
                  resolution: resolution.resolution,
                });

                if (resolution.record) {
                  this.localState.records.set(id, resolution.record);
                  result.synced.push(`cloudflare:${id}:resolved`);
                }
              }
            }
          }
        }
      } catch (error) {
        result.failed.push(`cloudflare:${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Pull from Salesforce
    if (this.salesforce) {
      try {
        const crmState = await this.salesforce.getCRMState();

        if (crmState.success && crmState.data) {
          // Convert CRM data to state records
          this.mergeCRMState(crmState.data);
          result.synced.push('salesforce:crm_state');
        }
      } catch (error) {
        result.failed.push(`salesforce:${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    this.updateLocalHash();
    return result;
  }

  /**
   * Push state to remote storage
   */
  private async pushToRemote(options: SyncOptions): Promise<StateSyncResult> {
    const result: StateSyncResult = {
      success: true,
      synced: [],
      failed: [],
      conflicts: [],
    };

    // Get records that need syncing
    const recordsToSync = Array.from(this.localState.records.values())
      .filter(r => {
        if (options.includeTypes && !options.includeTypes.includes(r.type)) {
          return false;
        }
        if (options.excludeTypes && options.excludeTypes.includes(r.type)) {
          return false;
        }
        return options.force || r.syncedTo.length < 2;
      });

    // Push to Cloudflare KV
    if (this.cloudflare) {
      try {
        const statePayload = {
          records: Object.fromEntries(this.localState.records),
          lastSync: this.localState.lastSync,
          hash: this.localState.hash,
        };

        const kvResult = await this.cloudflare.storeState('blackroad_state', statePayload);

        if (kvResult.success) {
          for (const record of recordsToSync) {
            if (!record.syncedTo.includes('cloudflare')) {
              record.syncedTo.push('cloudflare');
            }
            result.synced.push(`cloudflare:${record.id}`);
          }
        }
      } catch (error) {
        result.failed.push(`cloudflare:${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Push to Salesforce
    if (this.salesforce) {
      try {
        const statePayload = {
          records: Object.fromEntries(this.localState.records),
          lastSync: this.localState.lastSync,
          hash: this.localState.hash,
        };

        const sfResult = await this.salesforce.syncState('environments', statePayload);

        if (sfResult.success) {
          for (const record of recordsToSync) {
            if (!record.syncedTo.includes('salesforce')) {
              record.syncedTo.push('salesforce');
            }
            result.synced.push(`salesforce:${record.id}`);
          }
        }
      } catch (error) {
        result.failed.push(`salesforce:${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Resolve conflict between local and remote records
   */
  private resolveConflict(
    local: StateRecord,
    remote: StateRecord
  ): { resolution: StateConflict['resolution']; record: StateRecord | null } {
    switch (this.config.conflictResolution) {
      case 'local':
        return { resolution: 'local', record: local };

      case 'remote':
        return {
          resolution: 'remote',
          record: { ...remote, syncedTo: ['cloudflare', 'salesforce'] },
        };

      case 'latest':
        const localTime = new Date(local.updatedAt).getTime();
        const remoteTime = new Date(remote.updatedAt).getTime();

        if (localTime >= remoteTime) {
          return { resolution: 'local', record: local };
        } else {
          return {
            resolution: 'remote',
            record: { ...remote, syncedTo: ['cloudflare', 'salesforce'] },
          };
        }

      case 'manual':
      default:
        return { resolution: undefined, record: null };
    }
  }

  /**
   * Merge CRM state into local state
   */
  private mergeCRMState(crmState: CRMState): void {
    // Convert accounts to state records
    for (const account of crmState.accounts) {
      const id = `crm_account_${account.Id}`;
      if (!this.localState.records.has(id)) {
        this.localState.records.set(id, {
          id,
          type: 'crm_account',
          data: account as Record<string, unknown>,
          hash: hashState(account as Record<string, unknown>),
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncedTo: ['salesforce'],
        });
      }
    }

    // Convert contacts to state records
    for (const contact of crmState.contacts) {
      const id = `crm_contact_${contact.Id}`;
      if (!this.localState.records.has(id)) {
        this.localState.records.set(id, {
          id,
          type: 'crm_contact',
          data: contact as Record<string, unknown>,
          hash: hashState(contact as Record<string, unknown>),
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncedTo: ['salesforce'],
        });
      }
    }

    // Convert opportunities to state records
    for (const opportunity of crmState.opportunities) {
      const id = `crm_opportunity_${opportunity.Id}`;
      if (!this.localState.records.has(id)) {
        this.localState.records.set(id, {
          id,
          type: 'crm_opportunity',
          data: opportunity as Record<string, unknown>,
          hash: hashState(opportunity as Record<string, unknown>),
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncedTo: ['salesforce'],
        });
      }
    }
  }

  /**
   * Update local state hash
   */
  private updateLocalHash(): void {
    const stateData = {
      records: Object.fromEntries(this.localState.records),
      lastSync: this.localState.lastSync,
    };
    this.localState.hash = hashState(stateData);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get sync status
   */
  getSyncStatus(): {
    lastSync: string;
    recordCount: number;
    pendingSync: number;
    hash: string;
  } {
    const pendingSync = Array.from(this.localState.records.values())
      .filter(r => r.syncedTo.length < 2).length;

    return {
      lastSync: this.localState.lastSync,
      recordCount: this.localState.records.size,
      pendingSync,
      hash: this.localState.hash,
    };
  }

  /**
   * Export all state
   */
  exportState(): Record<string, unknown> {
    return {
      records: Object.fromEntries(this.localState.records),
      lastSync: this.localState.lastSync,
      hash: this.localState.hash,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import state
   */
  importState(state: Record<string, unknown>): void {
    const records = state['records'] as Record<string, StateRecord> | undefined;
    if (records) {
      this.localState.records = new Map(Object.entries(records));
    }

    this.localState.lastSync = state['lastSync'] as string ?? '';
    this.updateLocalHash();
  }

  /**
   * Clear all local state
   */
  clear(): void {
    this.localState.records.clear();
    this.localState.lastSync = '';
    this.localState.hash = '';
  }
}

/**
 * Create state manager instance
 */
export function createStateManager(config?: Partial<StateManagerConfig>): StateManager {
  return new StateManager(config);
}

export default StateManager;
