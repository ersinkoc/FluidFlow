/**
 * Secure process execution utilities
 * Prevents command injection by properly escaping arguments
 */

import { spawn, ChildProcess, execFileSync } from 'child_process';

/**
 * Securely executes a command with proper argument escaping
 */
export function secureExecSync(command: string, args: string[], options?: any): Buffer | string {
  // Validate command is in allowlist
  const allowedCommands = ['npx', 'npm', 'node', 'lsof', 'taskkill', 'netstat'];
  if (!allowedCommands.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // Escape arguments to prevent injection
  const escapedArgs = args.map(arg => {
    // Basic argument sanitization
    if (typeof arg !== 'string') {
      throw new Error('Arguments must be strings');
    }
    // Remove dangerous characters
    return arg.replace(/[;&|`$(){}[\]]/g, '');
  });

  return execFileSync(command, escapedArgs, options);
}

/**
 * Securely spawns a process with proper argument escaping
 */
export function secureSpawn(command: string, args: string[], options?: any): ChildProcess {
  // Validate command is in allowlist
  const allowedCommands = ['npx', 'npm', 'node', 'vite', 'npm-run-all'];
  if (!allowedCommands.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // Validate and escape arguments
  const sanitizedArgs = args.map(arg => {
    if (typeof arg !== 'string') {
      throw new Error('Arguments must be strings');
    }
    // Remove potentially dangerous characters
    const sanitized = arg.replace(/[;&|`$(){}[\]<>'"]/g, '');
    if (sanitized !== arg) {
      console.warn(`Argument sanitized: ${arg} -> ${sanitized}`);
    }
    return sanitized;
  });

  // Disable shell if not explicitly needed
  const secureOptions = {
    shell: false,
    ...options,
  };

  return spawn(command, sanitizedArgs, secureOptions);
}

/**
 * Kills a process by PID securely
 * BUG-001 fix: Use execFileSync with args array instead of execSync with string interpolation
 * to prevent command injection vulnerabilities
 */
export function secureKillProcess(pid: number | string): void {
  const pidStr = String(pid);

  // Validate PID is numeric (defense in depth)
  if (!/^\d+$/.test(pidStr)) {
    throw new Error(`Invalid PID: ${pid}`);
  }

  // Validate PID is within reasonable range (1 to 4194304 on Linux, similar on others)
  const pidNum = parseInt(pidStr, 10);
  if (pidNum < 1 || pidNum > 4194304) {
    throw new Error(`PID out of valid range: ${pid}`);
  }

  try {
    if (process.platform !== 'win32') {
      // On Unix systems - use execFileSync with args array (no shell)
      execFileSync('kill', ['-9', pidStr], { stdio: 'ignore' });
    } else {
      // On Windows - use execFileSync with args array (no shell)
      execFileSync('taskkill', ['/pid', pidStr, '/f'], { stdio: 'ignore' });
    }
  } catch (error) {
    // Process may already be dead, which is fine
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ESRCH' && err.code !== 'EPERM') {
      console.warn(`[secureKillProcess] Failed to kill PID ${pidStr}:`, err.message);
    }
  }
}