import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  getObsidianAppConfigPath,
  generateVaultId,
  registerVaultInConfig,
  createVault,
} from '../src/utils';

let testDir: string;
let fakeConfigPath: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-create-vault-test-'));
  fakeConfigPath = path.join(testDir, 'config', 'obsidian', 'obsidian.json');
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('getObsidianAppConfigPath', () => {
  it('resolves correct config path on Windows', () => {
    const origAppData = process.env.APPDATA;
    try {
      process.env.APPDATA = 'C:\\Users\\TestUser\\AppData\\Roaming';
      const resolved = getObsidianAppConfigPath('win32', 'C:\\Users\\TestUser');
      expect(resolved).toBe(path.join('C:\\Users\\TestUser\\AppData\\Roaming', 'obsidian', 'obsidian.json'));

      delete process.env.APPDATA;
      const fallback = getObsidianAppConfigPath('win32', 'C:\\Users\\TestUser');
      expect(fallback).toBe(path.join('C:\\Users\\TestUser', 'AppData', 'Roaming', 'obsidian', 'obsidian.json'));
    } finally {
      if (origAppData !== undefined) process.env.APPDATA = origAppData;
      else delete process.env.APPDATA;
    }
  });

  it('resolves correct config path on macOS (darwin)', () => {
    const resolved = getObsidianAppConfigPath('darwin', '/Users/TestUser');
    expect(resolved).toBe(path.join('/Users/TestUser', 'Library', 'Application Support', 'obsidian', 'obsidian.json'));
  });

  it('resolves correct config path on Linux with and without XDG_CONFIG_HOME', () => {
    const origXdg = process.env.XDG_CONFIG_HOME;
    try {
      delete process.env.XDG_CONFIG_HOME;
      const defaultLinux = getObsidianAppConfigPath('linux', '/home/testuser');
      expect(defaultLinux).toBe(path.join('/home/testuser', '.config', 'obsidian', 'obsidian.json'));

      process.env.XDG_CONFIG_HOME = '/custom/xdg/config';
      const customLinux = getObsidianAppConfigPath('linux', '/home/testuser');
      expect(customLinux).toBe(path.join('/custom/xdg/config', 'obsidian', 'obsidian.json'));
    } finally {
      if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
      else delete process.env.XDG_CONFIG_HOME;
    }
  });
});

describe('generateVaultId', () => {
  it('generates a 16-character hexadecimal string', () => {
    const id = generateVaultId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates unique IDs across calls', () => {
    const ids = new Set([generateVaultId(), generateVaultId(), generateVaultId()]);
    expect(ids.size).toBe(3);
  });
});

describe('registerVaultInConfig', () => {
  it('creates new obsidian.json if not present and registers vault', async () => {
    const vaultPath = path.join(testDir, 'NewVault');
    const result = await registerVaultInConfig(vaultPath, fakeConfigPath);

    expect(result.registered).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(result.vaultId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.configPath).toBe(fakeConfigPath);

    const content = JSON.parse(await fs.readFile(fakeConfigPath, 'utf-8'));
    expect(content.vaults).toBeDefined();
    expect(content.vaults[result.vaultId]).toEqual({
      path: path.resolve(vaultPath),
      ts: expect.any(Number),
    });
  });

  it('preserves existing vaults and creates backup when updating', async () => {
    await fs.mkdir(path.dirname(fakeConfigPath), { recursive: true });
    const existingVaults = {
      'existing12345678': { path: '/path/to/existing', ts: 1600000000000 },
    };
    await fs.writeFile(fakeConfigPath, JSON.stringify({ vaults: existingVaults }, null, 2), 'utf-8');

    const newVaultPath = path.join(testDir, 'SecondVault');
    const result = await registerVaultInConfig(newVaultPath, fakeConfigPath);

    expect(result.registered).toBe(true);
    expect(result.alreadyExisted).toBe(false);

    // Verify backup file exists
    const bakPath = `${fakeConfigPath}.bak`;
    const bakExists = await fs.stat(bakPath).then(() => true).catch(() => false);
    expect(bakExists).toBe(true);

    const content = JSON.parse(await fs.readFile(fakeConfigPath, 'utf-8'));
    expect(content.vaults['existing12345678']).toEqual({ path: '/path/to/existing', ts: 1600000000000 });
    expect(content.vaults[result.vaultId]).toEqual({
      path: path.resolve(newVaultPath),
      ts: expect.any(Number),
    });
  });

  it('is idempotent and returns existing ID without duplicating entries', async () => {
    const vaultPath = path.join(testDir, 'DuplicateVault');
    const firstResult = await registerVaultInConfig(vaultPath, fakeConfigPath);
    expect(firstResult.alreadyExisted).toBe(false);

    const secondResult = await registerVaultInConfig(vaultPath, fakeConfigPath);
    expect(secondResult.alreadyExisted).toBe(true);
    expect(secondResult.vaultId).toBe(firstResult.vaultId);

    const content = JSON.parse(await fs.readFile(fakeConfigPath, 'utf-8'));
    expect(Object.keys(content.vaults).length).toBe(1);
  });

  it('rejects when config file is corrupted and leaves original file untouched', async () => {
    await fs.mkdir(path.dirname(fakeConfigPath), { recursive: true });
    const corruptedContent = '{ not valid json...';
    await fs.writeFile(fakeConfigPath, corruptedContent, 'utf-8');

    const vaultPath = path.join(testDir, 'RecoverVault');
    await expect(registerVaultInConfig(vaultPath, fakeConfigPath)).rejects.toThrow();

    const content = await fs.readFile(fakeConfigPath, 'utf-8');
    expect(content).toBe(corruptedContent);
  });

  it('rejects relative vault paths', async () => {
    await expect(registerVaultInConfig('relative/path/to/vault', fakeConfigPath)).rejects.toThrow(/absolute/i);
    await expect(createVault('relative/path/to/vault', { customConfigPath: fakeConfigPath })).rejects.toThrow(/absolute/i);
  });
});

describe('createVault', () => {
  it('creates physical directory and registers in config', async () => {
    const vaultPath = path.join(testDir, 'PhysicalVault', 'SubFolder');
    const result = await createVault(vaultPath, { customConfigPath: fakeConfigPath });

    expect(result.path).toBe(path.resolve(vaultPath));
    expect(result.registered).toBe(true);
    expect(result.vaultId).toMatch(/^[0-9a-f]{16}$/);

    const stat = await fs.stat(result.path);
    expect(stat.isDirectory()).toBe(true);

    const content = JSON.parse(await fs.readFile(fakeConfigPath, 'utf-8'));
    expect(content.vaults[result.vaultId].path).toBe(result.path);
  });
});
