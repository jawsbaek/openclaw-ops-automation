/**
 * Platform Detection Utility
 * Provides OS detection and platform-specific command variants for monitoring
 */

/**
 * Get current platform
 * @returns {'darwin' | 'linux' | 'win32'} Platform identifier
 */
export function getPlatform() {
  return process.platform;
}

/**
 * Get CPU metrics command for current platform
 * @returns {string} CPU monitoring command
 */
export function getCpuCommand() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
      return 'top -l 1 -n 0';
    case 'linux':
      return 'top -bn2 -d 0.5';
    case 'win32':
      return 'wmic cpu get loadpercentage';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get memory metrics command for current platform
 * @returns {string} Memory monitoring command
 */
export function getMemoryCommand() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
      return 'vm_stat';
    case 'linux':
      return 'cat /proc/meminfo';
    case 'win32':
      return 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get process list command for current platform
 * @returns {string} Process listing command
 */
export function getProcessCommand() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
    case 'linux':
      return 'ps aux --sort=-%cpu | head -20';
    case 'win32':
      return 'tasklist /FO CSV /NH';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get disk usage command for current platform
 * @returns {string} Disk monitoring command
 */
export function getDiskCommand() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
    case 'linux':
      return 'df -h';
    case 'win32':
      return 'wmic logicaldisk get size,freespace,caption';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get network statistics command for current platform
 * @returns {string} Network monitoring command
 */
export function getNetworkCommand() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
      return 'netstat -ib';
    case 'linux':
      return 'cat /proc/net/dev';
    case 'win32':
      return 'netstat -e';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Check if command is available on current platform
 * @param {string} command - Command name to check
 * @returns {boolean} True if command exists
 */
export function isCommandAvailable(command) {
  if (!command || typeof command !== 'string' || command.trim() === '') {
    return false;
  }

  const platform = getPlatform();
  const checkCommand = platform === 'win32' ? `where ${command}` : `command -v ${command}`;

  try {
    const { execSync } = require('node:child_process');
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all platform-specific commands
 * @returns {Object} Command mapping for current platform
 */
export function getAllCommands() {
  return {
    platform: getPlatform(),
    cpu: getCpuCommand(),
    memory: getMemoryCommand(),
    process: getProcessCommand(),
    disk: getDiskCommand(),
    network: getNetworkCommand()
  };
}
