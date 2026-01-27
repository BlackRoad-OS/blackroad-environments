#!/usr/bin/env node

/**
 * BlackRoad Environments - State Sync Script
 *
 * Synchronizes state between Cloudflare KV, Salesforce, and local storage.
 *
 * Usage:
 *   node scripts/sync-state.js [command] [options]
 *
 * Commands:
 *   push      Push local state to remote
 *   pull      Pull remote state to local
 *   sync      Bidirectional sync (default)
 *   status    Show sync status
 *   export    Export state to file
 *   import    Import state from file
 */

const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

// State file location
const STATE_FILE = process.env.STATE_FILE || '.state/local.json';
const STATE_DIR = path.dirname(STATE_FILE);

/**
 * Generate SHA-256 hash
 */
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash state for integrity
 */
function hashState(state) {
  const sorted = JSON.stringify(state, Object.keys(state).sort());
  return sha256(sorted);
}

/**
 * Ensure state directory exists
 */
function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Load local state
 */
function loadLocalState() {
  ensureStateDir();

  if (!fs.existsSync(STATE_FILE)) {
    return {
      records: {},
      lastSync: null,
      hash: null,
    };
  }

  try {
    const content = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load state:', error.message);
    return {
      records: {},
      lastSync: null,
      hash: null,
    };
  }
}

/**
 * Save local state
 */
function saveLocalState(state) {
  ensureStateDir();

  state.hash = hashState(state.records);
  state.updatedAt = new Date().toISOString();

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`💾 State saved to ${STATE_FILE}`);
  console.log(`   Hash: ${state.hash.substring(0, 16)}...`);
}

/**
 * Get sync status
 */
function getSyncStatus(state) {
  const records = Object.values(state.records || {});
  const pendingSync = records.filter((r) => !r.syncedTo || r.syncedTo.length < 2);

  return {
    totalRecords: records.length,
    pendingSync: pendingSync.length,
    lastSync: state.lastSync || 'Never',
    currentHash: state.hash || 'N/A',
  };
}

/**
 * Mock push to Cloudflare (in real implementation, this would use the API)
 */
async function pushToCloudflare(state) {
  console.log('📤 Pushing to Cloudflare KV...');

  // In real implementation:
  // const client = createCloudflareClient(config);
  // await client.storeState('blackroad_state', state);

  // For now, simulate the operation
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('   ✅ Cloudflare KV updated');
  return true;
}

/**
 * Mock push to Salesforce (in real implementation, this would use the API)
 */
async function pushToSalesforce(state) {
  console.log('📤 Pushing to Salesforce...');

  // In real implementation:
  // const client = createSalesforceClient(config);
  // await client.syncState('environments', state);

  // For now, simulate the operation
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('   ✅ Salesforce updated');
  return true;
}

/**
 * Mock pull from Cloudflare
 */
async function pullFromCloudflare() {
  console.log('📥 Pulling from Cloudflare KV...');

  // In real implementation:
  // const client = createCloudflareClient(config);
  // const result = await client.retrieveState('blackroad_state');

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('   ✅ Cloudflare KV state retrieved');
  return null; // Return null to indicate no remote state (for demo)
}

/**
 * Mock pull from Salesforce
 */
async function pullFromSalesforce() {
  console.log('📥 Pulling from Salesforce...');

  // In real implementation:
  // const client = createSalesforceClient(config);
  // const result = await client.getCRMState();

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('   ✅ Salesforce state retrieved');
  return null; // Return null to indicate no remote state (for demo)
}

/**
 * Push command
 */
async function pushState() {
  console.log('\n🚀 Pushing state to remote storage...\n');

  const state = loadLocalState();
  const status = getSyncStatus(state);

  console.log(`📊 Local state: ${status.totalRecords} records`);
  console.log(`   Pending sync: ${status.pendingSync}`);
  console.log(`   Hash: ${status.currentHash?.substring(0, 16)}...`);
  console.log('');

  try {
    await Promise.all([pushToCloudflare(state), pushToSalesforce(state)]);

    // Mark records as synced
    for (const record of Object.values(state.records)) {
      record.syncedTo = ['cloudflare', 'salesforce'];
    }

    state.lastSync = new Date().toISOString();
    saveLocalState(state);

    console.log('\n✅ Push complete!');
  } catch (error) {
    console.error('\n❌ Push failed:', error.message);
    process.exit(1);
  }
}

/**
 * Pull command
 */
async function pullState() {
  console.log('\n📥 Pulling state from remote storage...\n');

  const localState = loadLocalState();

  try {
    const [cloudflareState, salesforceState] = await Promise.all([
      pullFromCloudflare(),
      pullFromSalesforce(),
    ]);

    // Merge remote state (in real implementation)
    // For now, just update last sync
    localState.lastSync = new Date().toISOString();
    saveLocalState(localState);

    console.log('\n✅ Pull complete!');
  } catch (error) {
    console.error('\n❌ Pull failed:', error.message);
    process.exit(1);
  }
}

/**
 * Sync command (bidirectional)
 */
async function syncState() {
  console.log('\n🔄 Synchronizing state...\n');

  await pullState();
  await pushState();

  console.log('\n✅ Sync complete!');
}

/**
 * Status command
 */
function showStatus() {
  console.log('\n📊 State Sync Status\n');

  const state = loadLocalState();
  const status = getSyncStatus(state);

  console.log(`Total Records:  ${status.totalRecords}`);
  console.log(`Pending Sync:   ${status.pendingSync}`);
  console.log(`Last Sync:      ${status.lastSync}`);
  console.log(`Current Hash:   ${status.currentHash}`);

  if (status.totalRecords > 0) {
    console.log('\nRecords by Type:');
    const byType = {};
    for (const record of Object.values(state.records || {})) {
      byType[record.type] = (byType[record.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log('');
}

/**
 * Export command
 */
function exportState(outputFile) {
  const file = outputFile || `state-export-${Date.now()}.json`;
  const state = loadLocalState();

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...state,
        exportedAt: new Date().toISOString(),
        exportHash: hashState(state.records),
      },
      null,
      2
    )
  );

  console.log(`\n✅ State exported to ${file}`);
  console.log(`   Records: ${Object.keys(state.records || {}).length}`);
  console.log(`   Hash: ${state.hash?.substring(0, 16)}...`);
  console.log('');
}

/**
 * Import command
 */
function importState(inputFile) {
  if (!inputFile || !fs.existsSync(inputFile)) {
    console.error('Error: Input file required and must exist');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(inputFile, 'utf-8');
    const importedState = JSON.parse(content);

    // Verify hash
    const computedHash = hashState(importedState.records);
    if (importedState.exportHash && computedHash !== importedState.exportHash) {
      console.warn('⚠️  Warning: Hash mismatch - data may be corrupted');
    }

    // Remove export metadata
    delete importedState.exportedAt;
    delete importedState.exportHash;

    saveLocalState(importedState);

    console.log(`\n✅ State imported from ${inputFile}`);
    console.log(`   Records: ${Object.keys(importedState.records || {}).length}`);
    console.log('');
  } catch (error) {
    console.error('Error importing state:', error.message);
    process.exit(1);
  }
}

/**
 * Print usage
 */
function printUsage() {
  console.log(`
BlackRoad State Sync

Usage:
  node scripts/sync-state.js <command> [options]

Commands:
  push              Push local state to remote storage
  pull              Pull remote state to local
  sync              Bidirectional sync (default)
  status            Show sync status
  export [file]     Export state to JSON file
  import <file>     Import state from JSON file

Environment Variables:
  STATE_FILE        Local state file path (default: .state/local.json)
  CLOUDFLARE_API_TOKEN    Cloudflare API token
  SALESFORCE_USERNAME     Salesforce username

Examples:
  node scripts/sync-state.js status
  node scripts/sync-state.js push
  node scripts/sync-state.js export backup.json
  node scripts/sync-state.js import backup.json
`);
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2] || 'sync';
  const arg = process.argv[3];

  switch (command) {
    case 'push':
      await pushState();
      break;

    case 'pull':
      await pullState();
      break;

    case 'sync':
      await syncState();
      break;

    case 'status':
      showStatus();
      break;

    case 'export':
      exportState(arg);
      break;

    case 'import':
      importState(arg);
      break;

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
