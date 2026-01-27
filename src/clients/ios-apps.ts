/**
 * BlackRoad Environments - iOS App Integrations
 *
 * URL scheme integrations for iOS development apps:
 * - Working Copy (Git client)
 * - Shellfish (SSH client)
 * - iSH (Linux shell)
 * - Pyto (Python IDE)
 */

import type {
  iOSAppConfig,
  WorkingCopyAction,
  ShellfishConnection,
} from '../types/index.js';

// ============================================
// Working Copy Integration
// ============================================

export interface WorkingCopyConfig {
  urlScheme?: string;
  callbackUrl?: string;
  key?: string;
}

export class WorkingCopyClient {
  private readonly urlScheme: string;
  private readonly callbackUrl: string;
  private readonly key: string;

  constructor(config: WorkingCopyConfig = {}) {
    this.urlScheme = config.urlScheme ?? 'working-copy://';
    this.callbackUrl = config.callbackUrl ?? '';
    this.key = config.key ?? '';
  }

  /**
   * Generate URL to clone a repository
   */
  cloneRepo(repoUrl: string, options?: { branch?: string }): string {
    const params = new URLSearchParams({
      cmd: 'clone',
      url: repoUrl,
    });

    if (options?.branch) {
      params.append('branch', options.branch);
    }

    if (this.key) {
      params.append('key', this.key);
    }

    if (this.callbackUrl) {
      params.append('x-success', this.callbackUrl);
    }

    return `${this.urlScheme}x-callback-url/clone?${params.toString()}`;
  }

  /**
   * Generate URL to open a repository
   */
  openRepo(repoName: string, path?: string): string {
    const params = new URLSearchParams({
      cmd: 'open',
      repo: repoName,
    });

    if (path) {
      params.append('path', path);
    }

    if (this.key) {
      params.append('key', this.key);
    }

    return `${this.urlScheme}x-callback-url/open?${params.toString()}`;
  }

  /**
   * Generate URL to pull changes
   */
  pull(repoName: string, remote?: string): string {
    const params = new URLSearchParams({
      cmd: 'pull',
      repo: repoName,
    });

    if (remote) {
      params.append('remote', remote);
    }

    if (this.key) {
      params.append('key', this.key);
    }

    if (this.callbackUrl) {
      params.append('x-success', this.callbackUrl);
    }

    return `${this.urlScheme}x-callback-url/pull?${params.toString()}`;
  }

  /**
   * Generate URL to push changes
   */
  push(repoName: string, remote?: string): string {
    const params = new URLSearchParams({
      cmd: 'push',
      repo: repoName,
    });

    if (remote) {
      params.append('remote', remote);
    }

    if (this.key) {
      params.append('key', this.key);
    }

    if (this.callbackUrl) {
      params.append('x-success', this.callbackUrl);
    }

    return `${this.urlScheme}x-callback-url/push?${params.toString()}`;
  }

  /**
   * Generate URL to commit changes
   */
  commit(repoName: string, message: string, options?: { limit?: string }): string {
    const params = new URLSearchParams({
      cmd: 'commit',
      repo: repoName,
      message,
    });

    if (options?.limit) {
      params.append('limit', options.limit);
    }

    if (this.key) {
      params.append('key', this.key);
    }

    if (this.callbackUrl) {
      params.append('x-success', this.callbackUrl);
    }

    return `${this.urlScheme}x-callback-url/commit?${params.toString()}`;
  }

  /**
   * Generate URL to write content to a file
   */
  writeFile(repoName: string, path: string, content: string, options?: {
    base64?: boolean;
    append?: boolean;
  }): string {
    const params = new URLSearchParams({
      cmd: 'write',
      repo: repoName,
      path,
    });

    if (options?.base64) {
      params.append('base64', 'true');
      params.append('text', Buffer.from(content).toString('base64'));
    } else {
      params.append('text', content);
    }

    if (options?.append) {
      params.append('mode', 'append');
    }

    if (this.key) {
      params.append('key', this.key);
    }

    return `${this.urlScheme}x-callback-url/write?${params.toString()}`;
  }

  /**
   * Generate URL to read file content
   */
  readFile(repoName: string, path: string): string {
    const params = new URLSearchParams({
      cmd: 'read',
      repo: repoName,
      path,
    });

    if (this.key) {
      params.append('key', this.key);
    }

    if (this.callbackUrl) {
      params.append('x-success', this.callbackUrl);
    }

    return `${this.urlScheme}x-callback-url/read?${params.toString()}`;
  }

  /**
   * Generate a complete workflow URL chain
   */
  generateWorkflow(actions: WorkingCopyAction[]): string[] {
    return actions.map(action => {
      switch (action.action) {
        case 'clone':
          return this.cloneRepo(action.repo ?? '', { branch: action.branch });
        case 'pull':
          return this.pull(action.repo ?? '');
        case 'push':
          return this.push(action.repo ?? '');
        case 'commit':
          return this.commit(action.repo ?? '', action.message ?? 'Update');
        case 'open':
          return this.openRepo(action.repo ?? '', action.path);
        default:
          return '';
      }
    }).filter(url => url !== '');
  }
}

// ============================================
// Shellfish Integration
// ============================================

export interface ShellfishConfig {
  urlScheme?: string;
}

export class ShellfishClient {
  private readonly urlScheme: string;

  constructor(config: ShellfishConfig = {}) {
    this.urlScheme = config.urlScheme ?? 'shellfish://';
  }

  /**
   * Generate URL to connect to a host
   */
  connect(connection: ShellfishConnection): string {
    const { host, port, username, keyName, command } = connection;

    // Build SSH URL
    let sshUrl = `ssh://${username ? `${username}@` : ''}${host}`;

    if (port !== 22) {
      sshUrl += `:${port}`;
    }

    const params = new URLSearchParams({
      url: sshUrl,
    });

    if (keyName) {
      params.append('key', keyName);
    }

    if (command) {
      params.append('command', command);
    }

    return `${this.urlScheme}open?${params.toString()}`;
  }

  /**
   * Generate URL to open SFTP browser
   */
  sftp(host: string, username: string, path?: string): string {
    const params = new URLSearchParams({
      url: `sftp://${username}@${host}${path ? path : ''}`,
    });

    return `${this.urlScheme}open?${params.toString()}`;
  }

  /**
   * Generate URL to run a command and return output
   */
  runCommand(connection: ShellfishConnection, command: string): string {
    return this.connect({
      ...connection,
      command,
    });
  }
}

// ============================================
// iSH Integration
// ============================================

export interface iSHConfig {
  sharedDirectory?: string;
}

export class iSHClient {
  private readonly sharedDirectory: string;

  constructor(config: iSHConfig = {}) {
    this.sharedDirectory = config.sharedDirectory ??
      '/private/var/mobile/Library/Mobile Documents/iCloud~app~ish~iSH/Documents';
  }

  /**
   * Get path in iSH shared directory
   */
  getSharedPath(relativePath: string): string {
    return `${this.sharedDirectory}/${relativePath}`;
  }

  /**
   * Generate shell script for iSH
   */
  generateScript(commands: string[], options?: {
    shebang?: string;
    exitOnError?: boolean;
  }): string {
    const shebang = options?.shebang ?? '#!/bin/sh';
    const exitOnError = options?.exitOnError !== false;

    let script = `${shebang}\n`;

    if (exitOnError) {
      script += 'set -e\n';
    }

    script += '\n';
    script += commands.join('\n');
    script += '\n';

    return script;
  }

  /**
   * Generate setup script for BlackRoad environment
   */
  generateSetupScript(): string {
    return this.generateScript([
      '# BlackRoad Environment Setup for iSH',
      '',
      '# Update packages',
      'apk update',
      'apk upgrade',
      '',
      '# Install essential tools',
      'apk add git nodejs npm python3 py3-pip curl wget',
      '',
      '# Install development tools',
      'apk add build-base python3-dev',
      '',
      '# Setup npm global directory',
      'mkdir -p ~/.npm-global',
      'npm config set prefix "~/.npm-global"',
      'echo "export PATH=~/.npm-global/bin:\\$PATH" >> ~/.profile',
      '',
      '# Create BlackRoad directory',
      'mkdir -p ~/blackroad',
      '',
      'echo "BlackRoad environment setup complete!"',
    ]);
  }
}

// ============================================
// Pyto Integration
// ============================================

export interface PytoConfig {
  urlScheme?: string;
  sharedDirectory?: string;
}

export class PytoClient {
  private readonly urlScheme: string;
  private readonly sharedDirectory: string;

  constructor(config: PytoConfig = {}) {
    this.urlScheme = config.urlScheme ?? 'pyto://';
    this.sharedDirectory = config.sharedDirectory ?? '';
  }

  /**
   * Generate URL to run a script
   */
  runScript(scriptPath: string, args?: string[]): string {
    const params = new URLSearchParams({
      script: scriptPath,
    });

    if (args && args.length > 0) {
      params.append('args', args.join(' '));
    }

    return `${this.urlScheme}run?${params.toString()}`;
  }

  /**
   * Generate URL to run code directly
   */
  runCode(code: string): string {
    const encoded = encodeURIComponent(code);
    return `${this.urlScheme}code/${encoded}`;
  }

  /**
   * Generate URL to open a file
   */
  openFile(path: string): string {
    const params = new URLSearchParams({ path });
    return `${this.urlScheme}open?${params.toString()}`;
  }

  /**
   * Generate Python script for BlackRoad integration
   */
  generateIntegrationScript(): string {
    return `#!/usr/bin/env python3
"""
BlackRoad Environments - Pyto Integration Script

This script provides utilities for integrating Pyto with
the BlackRoad environment management system.
"""

import os
import json
import hashlib
import urllib.request
from pathlib import Path
from typing import Dict, Any, Optional

# Configuration
BLACKROAD_API_BASE = os.environ.get('BLACKROAD_API_BASE', 'https://api.blackroad.io')
BLACKROAD_API_KEY = os.environ.get('BLACKROAD_API_KEY', '')

def sha256_hash(data: str) -> str:
    """Generate SHA-256 hash of data."""
    return hashlib.sha256(data.encode()).hexdigest()

def load_state(path: str = 'state.json') -> Dict[str, Any]:
    """Load state from JSON file."""
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_state(state: Dict[str, Any], path: str = 'state.json') -> None:
    """Save state to JSON file with hash verification."""
    state['hash'] = sha256_hash(json.dumps(state, sort_keys=True))
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)

def api_request(
    endpoint: str,
    method: str = 'GET',
    data: Optional[Dict] = None
) -> Dict[str, Any]:
    """Make API request to BlackRoad backend."""
    url = f"{BLACKROAD_API_BASE}{endpoint}"

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {BLACKROAD_API_KEY}',
        'User-Agent': 'BlackRoad-Pyto/1.0.0'
    }

    request = urllib.request.Request(url, headers=headers, method=method)

    if data:
        request.data = json.dumps(data).encode()

    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': str(e), 'status': e.code}

def sync_state() -> Dict[str, Any]:
    """Sync local state with remote."""
    local_state = load_state()

    result = api_request('/state/sync', 'POST', {
        'state': local_state,
        'hash': local_state.get('hash', '')
    })

    if 'error' not in result:
        save_state(result.get('state', {}))

    return result

def main():
    """Main entry point."""
    print("BlackRoad Pyto Integration")
    print("=" * 40)

    # Check configuration
    if not BLACKROAD_API_KEY:
        print("Warning: BLACKROAD_API_KEY not set")

    # Load and display state
    state = load_state()
    print(f"Local state hash: {state.get('hash', 'none')}")

    # Sync state
    print("\\nSyncing state...")
    result = sync_state()

    if 'error' in result:
        print(f"Sync failed: {result['error']}")
    else:
        print("State synced successfully!")

if __name__ == '__main__':
    main()
`;
  }
}

// ============================================
// Unified iOS App Manager
// ============================================

export class iOSAppManager {
  public readonly workingCopy: WorkingCopyClient;
  public readonly shellfish: ShellfishClient;
  public readonly ish: iSHClient;
  public readonly pyto: PytoClient;

  constructor(configs?: {
    workingCopy?: WorkingCopyConfig;
    shellfish?: ShellfishConfig;
    ish?: iSHConfig;
    pyto?: PytoConfig;
  }) {
    this.workingCopy = new WorkingCopyClient(configs?.workingCopy);
    this.shellfish = new ShellfishClient(configs?.shellfish);
    this.ish = new iSHClient(configs?.ish);
    this.pyto = new PytoClient(configs?.pyto);
  }

  /**
   * Generate setup instructions for all iOS apps
   */
  getSetupInstructions(): Record<string, string[]> {
    return {
      workingCopy: [
        '1. Install Working Copy from the App Store',
        '2. Open Settings > URL Callbacks',
        '3. Generate a secret key for API access',
        '4. Add the key to your .env as WORKING_COPY_KEY',
      ],
      shellfish: [
        '1. Install Shellfish from the App Store',
        '2. Configure SSH hosts in the app',
        '3. Import your SSH keys',
        '4. Use URL scheme shellfish:// for automation',
      ],
      ish: [
        '1. Install iSH from the App Store',
        '2. Enable iCloud Drive sync in Settings',
        '3. Run the setup script: source setup-ish.sh',
        '4. Access shared files at ~/Documents',
      ],
      pyto: [
        '1. Install Pyto from the App Store',
        '2. Grant file access permissions',
        '3. Import the integration script',
        '4. Configure BLACKROAD_API_KEY in settings',
      ],
    };
  }

  /**
   * Get all supported apps
   */
  getSupportedApps(): iOSAppConfig[] {
    return [
      { app: 'working_copy', urlScheme: 'working-copy://' },
      { app: 'shellfish', urlScheme: 'shellfish://' },
      { app: 'ish', urlScheme: 'ish://' },
      { app: 'pyto', urlScheme: 'pyto://' },
    ];
  }
}

/**
 * Create iOS app manager instance
 */
export function createiOSAppManager(configs?: {
  workingCopy?: WorkingCopyConfig;
  shellfish?: ShellfishConfig;
  ish?: iSHConfig;
  pyto?: PytoConfig;
}): iOSAppManager {
  return new iOSAppManager(configs);
}

export default iOSAppManager;
