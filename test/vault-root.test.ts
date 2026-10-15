import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isObsidianVault, validateVaultRoot, createVault } from '../src/utils';

// Regression tests for GHSA-74mh-44f5-p46j: the vault root must not be
// relocatable to arbitrary directories such as $HOME.

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-vault-root-test-'));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('isObsidianVault / validateVaultRoot', () => {
  it('accepts a directory containing .obsidian', async () => {
    const vault = path.join(testDir, 'vault');
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
    expect(await isObsidianVault(vault)).toBe(true);
    expect(await validateVaultRoot(vault)).toBe(vault);
  });

  it('rejects a plain directory like a home folder', async () => {
    const home = path.join(testDir, 'home');
    await fs.mkdir(path.join(home, '.ssh'), { recursive: true });
    await fs.writeFile(path.join(home, '.ssh', 'id_rsa'), 'secret');
    expect(await isObsidianVault(home)).toBe(false);
    await expect(validateVaultRoot(home)).rejects.toThrow(/Not an Obsidian vault/);
  });

  it('rejects relative, empty and missing paths', async () => {
    await expect(validateVaultRoot('vault')).rejects.toThrow(/absolute/);
    await expect(validateVaultRoot('')).rejects.toThrow(/absolute/);
    await expect(validateVaultRoot(path.join(testDir, 'missing'))).rejects.toThrow(/Not an Obsidian vault/);
  });

  it('rejects a path where .obsidian is a file', async () => {
    const dir = path.join(testDir, 'fake');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, '.obsidian'), '');
    expect(await isObsidianVault(dir)).toBe(false);
  });
});

describe('createVault confinement', () => {
  it('creates a .obsidian folder so the new vault validates', async () => {
    const vault = path.join(testDir, 'new-vault');
    const res = await createVault(vault);
    expect(res.path).toBe(vault);
    expect(await isObsidianVault(vault)).toBe(true);
  });

  it('allows an existing empty directory', async () => {
    const vault = path.join(testDir, 'empty');
    await fs.mkdir(vault);
    await createVault(vault);
    expect(await isObsidianVault(vault)).toBe(true);
  });

  it('allows an existing Obsidian vault', async () => {
    const vault = path.join(testDir, 'existing');
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
    await fs.writeFile(path.join(vault, 'note.md'), '# hi');
    await expect(createVault(vault)).resolves.toMatchObject({ path: vault });
  });

  it('refuses to turn a non-empty directory into a vault', async () => {
    const home = path.join(testDir, 'home');
    await fs.mkdir(home);
    await fs.writeFile(path.join(home, '.bashrc'), 'export X=1');
    await expect(createVault(home)).rejects.toThrow(/non-empty directory/);
    await expect(fs.access(path.join(home, '.obsidian'))).rejects.toThrow();
  });
});
