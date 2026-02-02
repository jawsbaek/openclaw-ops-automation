import {
  getAllCommands,
  getCpuCommand,
  getDiskCommand,
  getMemoryCommand,
  getNetworkCommand,
  getPlatform,
  getProcessCommand,
  isCommandAvailable
} from '../../lib/platform.js';

describe('Platform Detection Utility', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('getPlatform', () => {
    test('should return current platform', () => {
      const platform = getPlatform();
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });

    test('should return darwin on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getPlatform()).toBe('darwin');
    });

    test('should return linux on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getPlatform()).toBe('linux');
    });

    test('should return win32 on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getPlatform()).toBe('win32');
    });
  });

  describe('getCpuCommand', () => {
    test('should return macOS command for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getCpuCommand()).toBe('top -l 1 -n 0');
    });

    test('should return Linux command for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getCpuCommand()).toBe('top -bn2 -d 0.5');
    });

    test('should return Windows command for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getCpuCommand()).toBe('wmic cpu get loadpercentage');
    });

    test('should throw for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      expect(() => getCpuCommand()).toThrow('Unsupported platform: freebsd');
    });
  });

  describe('getMemoryCommand', () => {
    test('should return macOS command for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getMemoryCommand()).toBe('vm_stat');
    });

    test('should return Linux command for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getMemoryCommand()).toBe('cat /proc/meminfo');
    });

    test('should return Windows command for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getMemoryCommand()).toBe('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value');
    });

    test('should throw for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'aix' });
      expect(() => getMemoryCommand()).toThrow('Unsupported platform: aix');
    });
  });

  describe('getProcessCommand', () => {
    test('should return Unix command for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getProcessCommand()).toBe('ps aux --sort=-%cpu | head -20');
    });

    test('should return Unix command for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getProcessCommand()).toBe('ps aux --sort=-%cpu | head -20');
    });

    test('should return Windows command for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getProcessCommand()).toBe('tasklist /FO CSV /NH');
    });

    test('should throw for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'sunos' });
      expect(() => getProcessCommand()).toThrow('Unsupported platform: sunos');
    });
  });

  describe('getDiskCommand', () => {
    test('should return Unix command for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getDiskCommand()).toBe('df -h');
    });

    test('should return Unix command for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getDiskCommand()).toBe('df -h');
    });

    test('should return Windows command for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getDiskCommand()).toBe('wmic logicaldisk get size,freespace,caption');
    });

    test('should throw for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'openbsd' });
      expect(() => getDiskCommand()).toThrow('Unsupported platform: openbsd');
    });
  });

  describe('getNetworkCommand', () => {
    test('should return macOS command for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getNetworkCommand()).toBe('netstat -ib');
    });

    test('should return Linux command for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getNetworkCommand()).toBe('cat /proc/net/dev');
    });

    test('should return Windows command for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getNetworkCommand()).toBe('netstat -e');
    });

    test('should throw for unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'android' });
      expect(() => getNetworkCommand()).toThrow('Unsupported platform: android');
    });
  });

  describe('isCommandAvailable', () => {
    test('should return boolean for any command check', () => {
      const result = isCommandAvailable('ls');
      expect(typeof result).toBe('boolean');
    });

    test('should return false for unavailable command', () => {
      const result = isCommandAvailable('nonexistent_command_xyz123');
      expect(result).toBe(false);
    });

    test('should handle empty command name', () => {
      const result = isCommandAvailable('');
      expect(result).toBe(false);
    });

    test('should not throw on any input', () => {
      expect(() => isCommandAvailable('any_command')).not.toThrow();
      expect(() => isCommandAvailable('')).not.toThrow();
      expect(() => isCommandAvailable('special!@#$%')).not.toThrow();
    });
  });

  describe('getAllCommands', () => {
    test('should return all commands for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const commands = getAllCommands();

      expect(commands).toHaveProperty('platform', 'darwin');
      expect(commands).toHaveProperty('cpu', 'top -l 1 -n 0');
      expect(commands).toHaveProperty('memory', 'vm_stat');
      expect(commands).toHaveProperty('process', 'ps aux --sort=-%cpu | head -20');
      expect(commands).toHaveProperty('disk', 'df -h');
      expect(commands).toHaveProperty('network', 'netstat -ib');
    });

    test('should return all commands for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const commands = getAllCommands();

      expect(commands).toHaveProperty('platform', 'linux');
      expect(commands).toHaveProperty('cpu', 'top -bn2 -d 0.5');
      expect(commands).toHaveProperty('memory', 'cat /proc/meminfo');
      expect(commands).toHaveProperty('process', 'ps aux --sort=-%cpu | head -20');
      expect(commands).toHaveProperty('disk', 'df -h');
      expect(commands).toHaveProperty('network', 'cat /proc/net/dev');
    });

    test('should return all commands for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const commands = getAllCommands();

      expect(commands).toHaveProperty('platform', 'win32');
      expect(commands).toHaveProperty('cpu', 'wmic cpu get loadpercentage');
      expect(commands).toHaveProperty('memory', 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value');
      expect(commands).toHaveProperty('process', 'tasklist /FO CSV /NH');
      expect(commands).toHaveProperty('disk', 'wmic logicaldisk get size,freespace,caption');
      expect(commands).toHaveProperty('network', 'netstat -e');
    });
  });
});
