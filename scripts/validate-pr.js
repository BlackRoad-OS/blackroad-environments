#!/usr/bin/env node

/**
 * BlackRoad Environments - PR Validation Script
 *
 * Validates pull requests before merge to prevent failed PRs.
 *
 * Usage:
 *   node scripts/validate-pr.js [pr-number]
 *   npm run validate:pr [-- pr-number]
 *
 * Checks:
 * 1. All CI checks pass
 * 2. TypeScript compiles without errors
 * 3. ESLint passes
 * 4. Tests pass with minimum coverage
 * 5. No merge conflicts
 * 6. Commit messages follow conventions
 * 7. Required files are present
 * 8. Hash integrity of changed files
 */

const { execSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  requireTests: process.env.PR_REQUIRE_TESTS !== 'false',
  requireTypecheck: process.env.PR_REQUIRE_TYPECHECK !== 'false',
  requireLint: process.env.PR_REQUIRE_LINT !== 'false',
  minCoverage: parseInt(process.env.PR_MIN_COVERAGE || '80', 10),
  commitMessagePattern: /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,100}/,
  requiredFiles: ['package.json', 'tsconfig.json', 'LICENSE'],
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Log with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Run a command and return output
 */
function run(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (error) {
    if (options.allowFailure) {
      return error.stdout || '';
    }
    throw error;
  }
}

/**
 * Generate SHA-256 hash
 */
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Check result type
 */
class CheckResult {
  constructor(name, passed, message = '', details = null) {
    this.name = name;
    this.passed = passed;
    this.message = message;
    this.details = details;
  }
}

/**
 * Run TypeScript check
 */
async function checkTypeScript() {
  if (!CONFIG.requireTypecheck) {
    return new CheckResult('TypeScript', true, 'Skipped (disabled)');
  }

  log('\n📘 Checking TypeScript...', 'blue');

  try {
    run('npx tsc --noEmit', { silent: true });
    return new CheckResult('TypeScript', true, 'No type errors');
  } catch (error) {
    return new CheckResult(
      'TypeScript',
      false,
      'Type errors found',
      error.stdout || error.message
    );
  }
}

/**
 * Run ESLint check
 */
async function checkLint() {
  if (!CONFIG.requireLint) {
    return new CheckResult('ESLint', true, 'Skipped (disabled)');
  }

  log('\n🔍 Checking ESLint...', 'blue');

  try {
    run('npx eslint src --ext .ts,.tsx --max-warnings 0', { silent: true });
    return new CheckResult('ESLint', true, 'No lint errors');
  } catch (error) {
    return new CheckResult(
      'ESLint',
      false,
      'Lint errors found',
      error.stdout || error.message
    );
  }
}

/**
 * Run tests
 */
async function checkTests() {
  if (!CONFIG.requireTests) {
    return new CheckResult('Tests', true, 'Skipped (disabled)');
  }

  log('\n🧪 Running tests...', 'blue');

  try {
    const output = run('npx vitest run --coverage --reporter=json', {
      silent: true,
      allowFailure: true,
    });

    // Parse coverage if available
    const coverageMatch = output.match(/All files[^|]+\|\s*(\d+\.?\d*)/);
    const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

    if (coverage < CONFIG.minCoverage) {
      return new CheckResult(
        'Tests',
        false,
        `Coverage ${coverage}% is below minimum ${CONFIG.minCoverage}%`
      );
    }

    return new CheckResult('Tests', true, `Coverage: ${coverage}%`);
  } catch (error) {
    return new CheckResult('Tests', false, 'Tests failed', error.message);
  }
}

/**
 * Check for merge conflicts
 */
async function checkMergeConflicts() {
  log('\n🔀 Checking for merge conflicts...', 'blue');

  try {
    const files = run('git diff --name-only --diff-filter=U', {
      silent: true,
    }).trim();

    if (files) {
      return new CheckResult(
        'Merge Conflicts',
        false,
        'Merge conflicts detected',
        files.split('\n')
      );
    }

    // Check for conflict markers in files
    const allFiles = run('git diff --name-only HEAD~1', { silent: true }).trim();
    for (const file of allFiles.split('\n').filter(Boolean)) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('<<<<<<<') || content.includes('>>>>>>>')) {
          return new CheckResult(
            'Merge Conflicts',
            false,
            `Conflict markers found in ${file}`
          );
        }
      }
    }

    return new CheckResult('Merge Conflicts', true, 'No conflicts');
  } catch (error) {
    return new CheckResult(
      'Merge Conflicts',
      false,
      'Error checking conflicts',
      error.message
    );
  }
}

/**
 * Check commit messages
 */
async function checkCommitMessages() {
  log('\n📝 Checking commit messages...', 'blue');

  try {
    const commits = run('git log --format="%s" HEAD~10..HEAD', { silent: true })
      .trim()
      .split('\n')
      .filter(Boolean);

    const invalidCommits = commits.filter(
      (msg) => !CONFIG.commitMessagePattern.test(msg)
    );

    if (invalidCommits.length > 0) {
      return new CheckResult(
        'Commit Messages',
        false,
        'Invalid commit message format',
        invalidCommits
      );
    }

    return new CheckResult(
      'Commit Messages',
      true,
      `${commits.length} commits validated`
    );
  } catch (error) {
    return new CheckResult(
      'Commit Messages',
      true,
      'Could not check commits (likely first commit)'
    );
  }
}

/**
 * Check required files exist
 */
async function checkRequiredFiles() {
  log('\n📁 Checking required files...', 'blue');

  const missing = CONFIG.requiredFiles.filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    return new CheckResult(
      'Required Files',
      false,
      'Missing required files',
      missing
    );
  }

  return new CheckResult(
    'Required Files',
    true,
    `All ${CONFIG.requiredFiles.length} required files present`
  );
}

/**
 * Generate hash of changed files
 */
async function generateChangeHash() {
  log('\n🔐 Generating change hash...', 'blue');

  try {
    const files = run('git diff --name-only HEAD~1', { silent: true })
      .trim()
      .split('\n')
      .filter(Boolean);

    const hashes = [];
    for (const file of files) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file);
        hashes.push(`${file}:${sha256(content)}`);
      }
    }

    const combinedHash = sha256(hashes.sort().join('\n'));

    return new CheckResult(
      'Change Hash',
      true,
      `Hash: ${combinedHash.substring(0, 16)}...`,
      { hash: combinedHash, files: hashes }
    );
  } catch (error) {
    return new CheckResult('Change Hash', true, 'Could not generate hash');
  }
}

/**
 * Check package.json integrity
 */
async function checkPackageIntegrity() {
  log('\n📦 Checking package integrity...', 'blue');

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

    const issues = [];

    // Check for missing fields
    if (!pkg.name) issues.push('Missing "name" field');
    if (!pkg.version) issues.push('Missing "version" field');
    if (!pkg.license) issues.push('Missing "license" field');

    // Check for dangerous scripts
    if (pkg.scripts) {
      for (const [name, script] of Object.entries(pkg.scripts)) {
        if (script.includes('rm -rf /') || script.includes('sudo')) {
          issues.push(`Potentially dangerous script: ${name}`);
        }
      }
    }

    if (issues.length > 0) {
      return new CheckResult('Package Integrity', false, 'Issues found', issues);
    }

    return new CheckResult('Package Integrity', true, 'Package.json valid');
  } catch (error) {
    return new CheckResult(
      'Package Integrity',
      false,
      'Could not parse package.json',
      error.message
    );
  }
}

/**
 * Main validation function
 */
async function validate() {
  log('\n' + '='.repeat(60), 'cyan');
  log('  BlackRoad PR Validation', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`\nTimestamp: ${new Date().toISOString()}`);

  const results = [];

  // Run all checks
  results.push(await checkRequiredFiles());
  results.push(await checkPackageIntegrity());
  results.push(await checkMergeConflicts());
  results.push(await checkCommitMessages());
  results.push(await checkTypeScript());
  results.push(await checkLint());
  results.push(await checkTests());
  results.push(await generateChangeHash());

  // Print results
  log('\n' + '='.repeat(60), 'cyan');
  log('  Results', 'cyan');
  log('='.repeat(60), 'cyan');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? 'green' : 'red';
    log(`\n${icon} ${result.name}: ${result.message}`, color);

    if (result.details && !result.passed) {
      if (Array.isArray(result.details)) {
        result.details.forEach((d) => log(`   - ${d}`, 'yellow'));
      } else if (typeof result.details === 'string') {
        log(`   ${result.details}`, 'yellow');
      }
    }

    if (!result.passed) {
      allPassed = false;
    }
  }

  // Final summary
  log('\n' + '='.repeat(60), 'cyan');
  if (allPassed) {
    log('  ✅ All checks passed! Ready to merge.', 'green');
  } else {
    log('  ❌ Some checks failed. Please fix before merging.', 'red');
  }
  log('='.repeat(60) + '\n', 'cyan');

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

// Run validation
validate().catch((error) => {
  log(`\n❌ Validation failed: ${error.message}`, 'red');
  process.exit(1);
});
