/**
 * Secure process execution utilities
 * Prevents command injection by properly escaping arguments
 */

import { spawn, ChildProcess, execSync } from 'child_process';

/**
 * Securely executes a command with proper argument escaping
 */
export function secureExecSync(command: string, args: string[], options?: any): Buffer {
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

  return execSync(command, { ...options, args: escapedArgs });
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
 */
export function secureKillProcess(pid: number | string): void {
  const pidStr = String(pid);

  // Validate PID is numeric
  if (!/^\d+$/.test(pidStr)) {
    throw new Error(`Invalid PID: ${pid}`);
  }

  if (process.platform !== 'win32') {
    // On Unix systems
    execSync(`kill -9 ${pidStr}`, { stdio: 'ignore' });
  } else {
    // On Windows
    execSync(`taskkill /pid ${pidStr} /f`, { stdio: 'ignore' });
  }
}