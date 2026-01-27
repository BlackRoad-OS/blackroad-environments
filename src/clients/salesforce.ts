/**
 * BlackRoad Environments - Salesforce CRM Client
 *
 * Integration with Salesforce for CRM state management,
 * project tracking, and cross-platform data synchronization.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  SalesforceRecord,
  SalesforceQueryResult,
  CRMState,
} from '../types/index.js';
import { hashState } from '../utils/hash.js';

export interface SalesforceConfig extends APIClientConfig {
  loginUrl?: string;
  username: string;
  password: string;
  securityToken?: string;
  clientId?: string;
  clientSecret?: string;
  instanceUrl?: string;
}

interface SalesforceAuthResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
}

export class SalesforceClient extends BaseAPIClient {
  private readonly loginUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly securityToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private instanceUrl: string;
  private tokenExpiry: number = 0;

  constructor(config: SalesforceConfig) {
    super(config);

    this.loginUrl = config.loginUrl ?? 'https://login.salesforce.com';
    this.username = config.username;
    this.password = config.password;
    this.securityToken = config.securityToken ?? '';
    this.clientId = config.clientId ?? '';
    this.clientSecret = config.clientSecret ?? '';
    this.instanceUrl = config.instanceUrl ?? '';
  }

  /**
   * Health check for Salesforce API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const response = await this.query('SELECT Id FROM Organization LIMIT 1');
        return { status: response.success ? 'healthy' : 'unhealthy' };
      },
      'salesforce:healthCheck'
    );
  }

  /**
   * Authenticate with Salesforce
   */
  async authenticate(): Promise<APIResponse<{ instanceUrl: string }>> {
    return this.executeWithRetry(
      async () => {
        const params = new URLSearchParams({
          grant_type: 'password',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username: this.username,
          password: `${this.password}${this.securityToken}`,
        });

        const response = await fetch(`${this.loginUrl}/services/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Salesforce auth failed: ${error}`);
        }

        const data = await response.json() as SalesforceAuthResponse;

        this.accessToken = data.access_token;
        this.instanceUrl = data.instance_url;
        this.tokenExpiry = Date.now() + 7200000; // 2 hours

        return { instanceUrl: this.instanceUrl };
      },
      'salesforce:authenticate'
    );
  }

  /**
   * Ensure we have a valid authentication token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  // ============================================
  // SOQL Query Operations
  // ============================================

  /**
   * Execute SOQL query
   */
  async query<T extends SalesforceRecord = SalesforceRecord>(
    soql: string
  ): Promise<APIResponse<SalesforceQueryResult<T>>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
        return this.request<SalesforceQueryResult<T>>(endpoint, 'GET');
      },
      'salesforce:query'
    );
  }

  /**
   * Execute SOSL search
   */
  async search(sosl: string): Promise<APIResponse<SalesforceRecord[]>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/search?q=${encodeURIComponent(sosl)}`;
        const response = await this.request<{ searchRecords: SalesforceRecord[] }>(endpoint, 'GET');
        return response.searchRecords;
      },
      'salesforce:search'
    );
  }

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Create a record
   */
  async create(
    sobject: string,
    data: Record<string, unknown>
  ): Promise<APIResponse<{ id: string; success: boolean }>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/sobjects/${sobject}`;
        return this.request(endpoint, 'POST', data);
      },
      'salesforce:create'
    );
  }

  /**
   * Update a record
   */
  async update(
    sobject: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/sobjects/${sobject}/${id}`;
        await this.request(endpoint, 'PATCH', data);
        return true;
      },
      'salesforce:update'
    );
  }

  /**
   * Upsert a record using external ID
   */
  async upsert(
    sobject: string,
    externalIdField: string,
    externalId: string,
    data: Record<string, unknown>
  ): Promise<APIResponse<{ id: string; created: boolean }>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/sobjects/${sobject}/${externalIdField}/${externalId}`;
        return this.request(endpoint, 'PATCH', data);
      },
      'salesforce:upsert'
    );
  }

  /**
   * Delete a record
   */
  async delete(sobject: string, id: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = `/services/data/v59.0/sobjects/${sobject}/${id}`;
        await this.request(endpoint, 'DELETE');
        return true;
      },
      'salesforce:delete'
    );
  }

  /**
   * Get a single record by ID
   */
  async getRecord<T extends SalesforceRecord = SalesforceRecord>(
    sobject: string,
    id: string,
    fields?: string[]
  ): Promise<APIResponse<T>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        let endpoint = `/services/data/v59.0/sobjects/${sobject}/${id}`;
        if (fields && fields.length > 0) {
          endpoint += `?fields=${fields.join(',')}`;
        }
        return this.request<T>(endpoint, 'GET');
      },
      'salesforce:getRecord'
    );
  }

  // ============================================
  // Composite Operations
  // ============================================

  /**
   * Execute composite request (multiple operations in single call)
   */
  async composite(
    requests: Array<{
      method: string;
      url: string;
      referenceId: string;
      body?: Record<string, unknown>;
    }>
  ): Promise<APIResponse<Array<{ httpStatusCode: number; body: unknown; referenceId: string }>>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();
        const endpoint = '/services/data/v59.0/composite';
        const response = await this.request<{
          compositeResponse: Array<{ httpStatusCode: number; body: unknown; referenceId: string }>;
        }>(endpoint, 'POST', {
          allOrNone: false,
          compositeRequest: requests,
        });
        return response.compositeResponse;
      },
      'salesforce:composite'
    );
  }

  // ============================================
  // CRM State Management
  // ============================================

  /**
   * Get full CRM state snapshot
   */
  async getCRMState(): Promise<APIResponse<CRMState>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();

        // Fetch all relevant objects in parallel
        const [accounts, contacts, opportunities] = await Promise.all([
          this.query('SELECT Id, Name, Type, Industry FROM Account LIMIT 1000'),
          this.query('SELECT Id, Name, Email, AccountId FROM Contact LIMIT 1000'),
          this.query('SELECT Id, Name, Amount, StageName, AccountId FROM Opportunity LIMIT 1000'),
        ]);

        const state: CRMState = {
          accounts: accounts.data?.records ?? [],
          contacts: contacts.data?.records ?? [],
          opportunities: opportunities.data?.records ?? [],
          customObjects: {},
          lastSync: new Date().toISOString(),
          hash: '',
        };

        state.hash = hashState(state);

        return state;
      },
      'salesforce:getCRMState'
    );
  }

  /**
   * Sync state to custom object for cross-platform access
   */
  async syncState(
    stateType: string,
    state: Record<string, unknown>
  ): Promise<APIResponse<{ id: string; hash: string }>> {
    return this.executeWithRetry(
      async () => {
        await this.ensureAuthenticated();

        const hash = hashState(state);
        const externalId = `BR_${stateType}_STATE`;

        const result = await this.upsert(
          'BlackRoad_State__c',
          'External_Id__c',
          externalId,
          {
            Name: `${stateType} State`,
            State_Type__c: stateType,
            State_Data__c: JSON.stringify(state),
            State_Hash__c: hash,
            Last_Sync__c: new Date().toISOString(),
          }
        );

        return {
          id: result.data?.id ?? externalId,
          hash,
        };
      },
      'salesforce:syncState'
    );
  }

  // ============================================
  // Internal Request Helper
  // ============================================

  private async request<T>(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.instanceUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      Authorization: `Bearer ${this.accessToken}`,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && !['GET', 'DELETE'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (method === 'DELETE' && response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Salesforce API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create and register Salesforce client
 */
export function createSalesforceClient(config: SalesforceConfig): SalesforceClient {
  const client = new SalesforceClient(config);
  clientRegistry.register('salesforce', client);
  return client;
}

export default SalesforceClient;
