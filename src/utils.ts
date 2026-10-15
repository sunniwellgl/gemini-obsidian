import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as crypto from 'crypto';
import matter from 'gray-matter';

/**
 * Resolve a user-supplied relative path against a vault root, ensuring
 * the result stays within the vault boundary.  Throws on traversal.
 */
export function getSafeFilePath(vaultPath: string, userInputPath: string): string {
  const resolvedVault = path.resolve(vaultPath);
  const resolvedTarget = path.resolve(resolvedVault, userInputPath);
  const rel = path.relative(resolvedVault, resolvedTarget);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error("Security Error: Path traversal detected.");
  }
  return resolvedTarget;
}

/**
 * True when `dir` is an absolute path to an existing directory that
 * contains an `.obsidian` folder, i.e. a real Obsidian vault.
 *
 * Used to keep the vault root from being pointed at arbitrary
 * directories such as $HOME or /etc.
 */
export async function isObsidianVault(dir: string): Promise<boolean> {
  if (!dir || !path.isAbsolute(dir)) return false;
  try {
    const stat = await fs.stat(path.join(dir, '.obsidian'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Validate a vault root and return it resolved. Throws unless it is an
 * existing Obsidian vault.
 */
export async function validateVaultRoot(dir: string): Promise<string> {
  if (!dir || !path.isAbsolute(dir)) {
    throw new Error(`Vault path must be absolute: ${dir}`);
  }
  const resolved = path.resolve(dir);
  if (!(await isObsidianVault(resolved))) {
    throw new Error(`Not an Obsidian vault (no .obsidian folder): ${resolved}`);
  }
  return resolved;
}

/**
 * Extract deduplicated wikilink targets from markdown content.
 * Handles [[Simple]] and [[Link|Alias]] forms.
 */
export function extractWikilinks(content: string): string[] {
  const regex = /\[\[(.*?)(?:\|.*?)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}

export interface SectionRange {
  headingStart: number;
  headingEnd: number;
  bodyStart: number;
  bodyEnd: number;
  level: number;
}

/**
 * Find the range of a section under a heading in markdown content.
 * Returns null if heading not found.
 */
export function findSectionRange(content: string, heading: string): SectionRange | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRegex = new RegExp(`^(#{1,6})\\s+${escapedHeading}\\s*$`, 'm');
  const match = headingRegex.exec(content);
  if (!match) return null;

  const level = match[1].length;
  const headingStart = match.index;
  const headingEnd = headingStart + match[0].length;
  const bodyStart = headingEnd;

  // Find next heading at same or higher level (fewer or equal #'s)
  const rest = content.slice(bodyStart);
  const nextHeadingRegex = new RegExp(`^#{1,${level}}\\s`, 'm');
  const nextMatch = nextHeadingRegex.exec(rest);
  const bodyEnd = nextMatch ? bodyStart + nextMatch.index : content.length;

  return { headingStart, headingEnd, bodyStart, bodyEnd, level };
}

/**
 * Replace the body under a heading, preserving the heading line itself.
 * Returns the updated file content.
 */
export function replaceSection(fileContent: string, range: SectionRange, newBody: string): string {
  return fileContent.slice(0, range.bodyStart) + '\n' + newBody + '\n' + fileContent.slice(range.bodyEnd);
}

/**
 * Insert content under a heading at the given position.
 * If range is null (heading not found), appends a new ## section.
 * Returns the updated file content.
 */
export function insertAtHeading(
  fileContent: string,
  heading: string,
  content: string,
  position: 'beginning' | 'end',
  range: SectionRange | null,
): string {
  if (range) {
    if (position === 'beginning') {
      return fileContent.slice(0, range.bodyStart) + '\n' + content + fileContent.slice(range.bodyStart);
    }
    const before = fileContent.slice(0, range.bodyEnd);
    const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    return before + sep + content + '\n' + fileContent.slice(range.bodyEnd);
  }
  return fileContent + `\n\n## ${heading}\n${content}`;
}

/** Build the glob pattern for obsidian_list_notes. Recurses into subfolder when given. */
export function listNotesPattern(subfolder?: string): string {
  if (!subfolder) return '**/*.md';
  const normalized = path.normalize(subfolder);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('..' + path.sep)) {
    throw new Error("Security Error: Path traversal detected.");
  }
  return path.join(normalized, '**', '*.md');
}

/** Replace the first occurrence of oldText with newText. Throws if not found. */
export function replaceInNote(content: string, oldText: string, newText: string): string {
  const idx = content.indexOf(oldText);
  if (idx === -1) throw new Error(`Text not found: "${oldText}"`);
  return content.slice(0, idx) + newText + content.slice(idx + oldText.length);
}

/** Strip the #heading fragment from a wikilink target. */
export function stripHeadingFromLink(link: string): string {
  const idx = link.indexOf('#');
  return idx === -1 ? link : link.slice(0, idx);
}

type FrontmatterUpdate =
  | { key: string; value: string; updates?: never }
  | { updates: Record<string, unknown>; key?: never; value?: never };

/** Apply a single key/value or a batch of updates to YAML frontmatter. Returns updated file content. */
export function applyFrontmatterUpdate(fileContent: string, update: FrontmatterUpdate): string {
  const parsed = matter(fileContent);
  if (update.updates) {
    for (const [k, v] of Object.entries(update.updates)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      parsed.data[k] = v;
    }
  } else {
    let value: unknown = update.value;
    try { value = JSON.parse(String(update.value)); } catch { /* use as string */ }
    parsed.data[update.key] = value;
  }
  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Resolve the platform-specific path to the Obsidian desktop app configuration file (obsidian.json).
 */
export function getObsidianAppConfigPath(
  platform: NodeJS.Platform = process.platform,
  homedir: string = os.homedir()
): string {
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    return path.join(appData, 'obsidian', 'obsidian.json');
  }
  if (platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }
  // Linux / other Unix-like systems (respecting XDG Base Directory specification)
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  return path.join(configHome, 'obsidian', 'obsidian.json');
}

/**
 * Generate a 16-character lowercase hexadecimal ID for Obsidian vault registration.
 */
export function generateVaultId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export interface RegisterVaultResult {
  registered: boolean;
  vaultId: string;
  alreadyExisted: boolean;
  configPath: string;
}

/**
 * Register a vault path in the Obsidian desktop application configuration (obsidian.json).
 * Creates the config file if it does not exist, avoids duplicate entries, and writes atomically.
 */
export async function registerVaultInConfig(
  vaultPath: string,
  customConfigPath?: string
): Promise<RegisterVaultResult> {
  if (!path.isAbsolute(vaultPath)) {
    throw new Error(`Vault path must be absolute: ${vaultPath}`);
  }
  const resolvedVaultPath = path.resolve(vaultPath);
  const configPath = customConfigPath || getObsidianAppConfigPath();

  await fs.mkdir(path.dirname(configPath), { recursive: true });

  let config: { vaults?: Record<string, { path: string; ts: number }> } = { vaults: {} };
  let fileExists = false;

  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      config = parsed;
      if (!config.vaults || typeof config.vaults !== 'object') {
        config.vaults = {};
      }
    }
    fileExists = true;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      config = { vaults: {} };
    } else {
      throw e;
    }
  }

  // Check if vault is already registered under any existing ID
  if (config.vaults) {
    for (const [id, entry] of Object.entries(config.vaults)) {
      if (entry && typeof entry.path === 'string' && path.resolve(entry.path) === resolvedVaultPath) {
        return {
          registered: true,
          vaultId: id,
          alreadyExisted: true,
          configPath,
        };
      }
    }
  }

  const vaultId = generateVaultId();
  if (!config.vaults) config.vaults = {};
  config.vaults[vaultId] = {
    path: resolvedVaultPath,
    ts: Date.now(),
  };

  const tempPath = `${configPath}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');

  if (fileExists) {
    try {
      await fs.copyFile(configPath, `${configPath}.bak`);
    } catch {}
  }

  await fs.rename(tempPath, configPath);

  return {
    registered: true,
    vaultId,
    alreadyExisted: false,
    configPath,
  };
}

export interface CreateVaultResult {
  path: string;
  registered: boolean;
  vaultId?: string;
  alreadyExisted?: boolean;
  configPath?: string;
}

/**
 * Create a physical vault directory and optionally register it in the Obsidian desktop app configuration.
 */
export async function createVault(
  vaultPath: string,
  options?: { register?: boolean; customConfigPath?: string }
): Promise<CreateVaultResult> {
  if (!path.isAbsolute(vaultPath)) {
    throw new Error(`Vault path must be absolute: ${vaultPath}`);
  }
  const resolvedPath = path.resolve(vaultPath);

  // Refuse to turn an existing, non-empty directory (e.g. $HOME) into a
  // vault. Existing Obsidian vaults are allowed.
  let entries: string[] | null = null;
  try {
    entries = await fs.readdir(resolvedPath);
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
  if (entries && entries.length > 0 && !(await isObsidianVault(resolvedPath))) {
    throw new Error(`Refusing to create a vault in a non-empty directory: ${resolvedPath}`);
  }

  await fs.mkdir(path.join(resolvedPath, '.obsidian'), { recursive: true });

  if (options?.register) {
    const regResult = await registerVaultInConfig(resolvedPath, options?.customConfigPath);
    return {
      path: resolvedPath,
      registered: regResult.registered,
      vaultId: regResult.vaultId,
      alreadyExisted: regResult.alreadyExisted,
      configPath: regResult.configPath,
    };
  }

  return {
    path: resolvedPath,
    registered: false,
  };
}
