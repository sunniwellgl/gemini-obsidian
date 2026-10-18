import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';
import { getSafeFilePath } from './utils.js';

export interface HarvestOptions {
  date?: string; // Target date in YYYY-MM-DD format (defaults to current local date)
  geminiDir?: string; // Gemini CLI base directory (defaults to ~/.gemini)
  vaultPath?: string; // Optional path to Obsidian vault
  templatePath?: string; // Optional relative path to a custom markdown template inside the vault
}

export interface SessionStats {
  userTurnCount: number;
  toolCallCount: number;
  toolsUsed: Record<string, number>;
}

export interface ProjectSessionRecap {
  projectName: string;
  projectPath: string;
  sessionId: string;
  sessionFile: string;
  userPrompts: string[];
  topics: string[];
  keyActions: string[];
  stats: SessionStats;
}

export interface HarvestReport {
  date: string;
  totalSessionsScanned: number;
  activeProjectsCount: number;
  templateContent?: string;
  projects: ProjectSessionRecap[];
}

/**
 * Resolves the mapping between tmpDirId and the actual project workspace path from projects.json.
 */
export async function resolveProjectMapping(geminiDir: string): Promise<Record<string, string>> {
  const projectsJsonPath = path.join(geminiDir, 'projects.json');
  const mapping: Record<string, string> = {};

  try {
    const raw = await fs.readFile(projectsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const projects = parsed.projects || {};

    for (const [realPath, tmpId] of Object.entries(projects)) {
      if (typeof tmpId === 'string') {
        mapping[tmpId] = realPath;
      }
    }
  } catch {
    // If projects.json is missing or invalid, return empty mapping
  }

  return mapping;
}

/**
 * Known internal runtime context tags to strip from messages (including multiline content).
 */
const INTERNAL_CONTEXT_TAGS = [
  'session_context',
  'system_note',
  'scratchpad',
  'state_snapshot',
  'loaded_context',
  'extension_context',
];

/**
 * Known framework and tool preambles to filter out from user prompt extraction.
 */
const IGNORED_PREAMBLE_PATTERNS = [
  '## 1.0 SYSTEM DIRECTIVE', // Conductor task directive preamble
  '[System:',                // CLI framework notices
];

/**
 * Cleans user message text by stripping out internal system injections, tags, and context blocks.
 */
function cleanUserText(rawText: string): string | null {
  if (!rawText) return null;

  // Strip paired internal context blocks (including multiline contents)
  let text = rawText;
  for (const tag of INTERNAL_CONTEXT_TAGS) {
    const regex = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
    text = text.replace(regex, '');
  }
  text = text.trim();

  if (!text) return null;

  for (const pattern of IGNORED_PREAMBLE_PATTERNS) {
    if (text.includes(pattern)) {
      return null;
    }
  }

  return text;
}

/**
 * Extracts high-signal engineering milestones from tool calls (VCS, testing, builds, note operations).
 */
function extractKeyAction(toolName: string, args: Record<string, any> = {}): string | null {
  if (toolName === 'run_shell_command') {
    const cmd = typeof args?.command === 'string' ? args.command.trim() : '';
    if (!cmd) return null;

    // Version control milestones: git commit, push, merge, rebase, tag, pr
    if (
      cmd.startsWith('git commit') ||
      cmd.startsWith('git push') ||
      cmd.startsWith('git merge') ||
      cmd.startsWith('git rebase') ||
      cmd.startsWith('git tag') ||
      cmd.startsWith('gh pr') ||
      cmd.includes('git commit') ||
      cmd.includes('git push')
    ) {
      return `VCS: ${cmd.slice(0, 70)}`;
    }

    // Test runner operations: test, vitest, jest, pytest, cargo test, etc.
    if (
      cmd.startsWith('npm test') ||
      cmd.startsWith('npm run test') ||
      cmd.startsWith('npx vitest') ||
      cmd.startsWith('pytest') ||
      cmd.startsWith('cargo test') ||
      cmd.startsWith('go test') ||
      cmd.startsWith('ctest') ||
      cmd.startsWith('make test')
    ) {
      return `Test: ${cmd.slice(0, 70)}`;
    }

    // Build & Packaging: npm run build, cargo build, make, docker, etc.
    if (
      cmd.startsWith('npm run build') ||
      cmd.startsWith('cargo build') ||
      cmd.startsWith('docker build') ||
      cmd.startsWith('cmake --build')
    ) {
      return `Build: ${cmd.slice(0, 70)}`;
    }
  }

  // High-signal tools: note creation/vault operations, issue tracking, code reviews
  if (
    toolName === 'obsidian_create_note' ||
    toolName === 'obsidian_append_note' ||
    toolName === 'obsidian_create_vault' ||
    toolName.includes('issue') ||
    toolName.includes('pull_request') ||
    toolName.includes('review') ||
    toolName.includes('ticket')
  ) {
    return `Action: ${toolName}`;
  }

  return null;
}

/**
 * Parses a single JSONL session chat log and extracts high-signal intents and tool usage.
 */
export async function parseSessionJsonl(
  sessionFile: string,
  tmpDirName: string,
  projectPath: string
): Promise<ProjectSessionRecap | null> {
  let content: string;
  try {
    content = await fs.readFile(sessionFile, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const userPrompts: string[] = [];
  const topics: string[] = [];
  const keyActions: string[] = [];
  const toolsUsed: Record<string, number> = {};
  let toolCallCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Gracefully ignore corrupt or partial JSON lines
      continue;
    }

    const role = parsed.role || parsed.type;

    // 1. Extract user queries
    if (role === 'user') {
      const parts = parsed.parts || parsed.content || parsed.message;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p && typeof p === 'object') {
            if (typeof p.text === 'string') {
              const cleaned = cleanUserText(p.text);
              if (cleaned && !userPrompts.includes(cleaned)) {
                userPrompts.push(cleaned);
              }
            }
          } else if (typeof p === 'string') {
            const cleaned = cleanUserText(p);
            if (cleaned && !userPrompts.includes(cleaned)) {
              userPrompts.push(cleaned);
            }
          }
        }
      } else if (typeof parts === 'string') {
        const cleaned = cleanUserText(parts);
        if (cleaned && !userPrompts.includes(cleaned)) {
          userPrompts.push(cleaned);
        }
      }
    }

    // 2. Extract tool calls and topics (supports role === 'model', type === 'gemini', toolCalls array)
    if (role === 'model' || role === 'gemini' || Array.isArray(parsed.toolCalls)) {
      // Check top-level toolCalls array (native Gemini CLI format)
      if (Array.isArray(parsed.toolCalls)) {
        for (const tc of parsed.toolCalls) {
          if (!tc || typeof tc !== 'object') continue;
          const toolName = tc.name || tc.call;
          if (toolName) {
            toolCallCount++;
            toolsUsed[toolName] = (toolsUsed[toolName] || 0) + 1;

            if (toolName === 'update_topic') {
              const args = tc.args || tc.parameters || {};
              const topicText = args.title || args.strategic_intent;
              if (topicText && typeof topicText === 'string' && !topics.includes(topicText)) {
                topics.push(topicText);
              }
            } else {
              const action = extractKeyAction(toolName, tc.args || tc.parameters || {});
              if (action && !keyActions.includes(action)) {
                keyActions.push(action);
              }
            }
          }
        }
      }

      // Check parts/content structure (standard API format)
      const parts = parsed.parts || parsed.content || [];
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (!p || typeof p !== 'object') continue;

          const fn = p.functionCall || p.call;
          if (fn) {
            const toolName = fn.name || fn.call || p.name;
            if (toolName) {
              toolCallCount++;
              toolsUsed[toolName] = (toolsUsed[toolName] || 0) + 1;

              // Topic updates
              if (toolName === 'update_topic') {
                const args = fn.args || fn.parameters || {};
                const topicText = args.title || args.strategic_intent;
                if (topicText && typeof topicText === 'string' && !topics.includes(topicText)) {
                  topics.push(topicText);
                }
              } else {
                const action = extractKeyAction(toolName, fn.args || fn.parameters || {});
                if (action && !keyActions.includes(action)) {
                  keyActions.push(action);
                }
              }
            }
          }
        }
      }
    }
  }

  // Filter empty sessions
  if (userPrompts.length === 0 && topics.length === 0) {
    return null;
  }

  // Infer project name
  let projectName = tmpDirName;
  if (projectPath) {
    projectName = path.basename(projectPath);
  }

  // Extract session ID from filename
  const baseName = path.basename(sessionFile, '.jsonl');
  const idMatch = baseName.match(/session-[\d-]+T[\d-]+-([a-zA-Z0-9]+)/);
  const sessionId = idMatch ? idMatch[1] : baseName;

  return {
    projectName,
    projectPath,
    sessionId,
    sessionFile,
    userPrompts,
    topics,
    keyActions,
    stats: {
      userTurnCount: userPrompts.length,
      toolCallCount,
      toolsUsed,
    },
  };
}

/**
 * Tries to read template content with support for both ${templatePath}.md and ${templatePath}.
 */
async function tryReadTemplate(vaultPath: string, templateRelativeOrAbs: string): Promise<string | undefined> {
  const candidates: string[] = [];
  try {
    const safeTarget = getSafeFilePath(vaultPath, templateRelativeOrAbs);
    if (safeTarget.endsWith('.md')) {
      candidates.push(safeTarget);
    } else {
      candidates.push(`${safeTarget}.md`, safeTarget);
    }
  } catch {
    return undefined;
  }

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf-8');
    } catch {
      // Continue to next candidate
    }
  }
  return undefined;
}

/**
 * Loads the user's custom markdown template from the Obsidian vault.
 * Priority:
 * 1. Explicit templatePath (if passed)
 * 2. Auto-discovery from <vault>/.obsidian/daily-notes.json ('template' property)
 * 3. Graceful fallback (undefined)
 */
export async function loadTemplateContent(
  vaultPath?: string,
  templatePath?: string
): Promise<string | undefined> {
  if (!vaultPath) {
    return undefined;
  }

  // Priority 1: Explicit templatePath
  if (templatePath && templatePath.trim()) {
    return await tryReadTemplate(vaultPath, templatePath.trim());
  }

  // Priority 2: Auto-discovery from .obsidian/daily-notes.json
  const dailyNotesConfigPath = path.join(vaultPath, '.obsidian', 'daily-notes.json');
  try {
    const rawConfig = await fs.readFile(dailyNotesConfigPath, 'utf-8');
    const parsedConfig = JSON.parse(rawConfig);
    if (typeof parsedConfig?.template === 'string' && parsedConfig.template.trim()) {
      return await tryReadTemplate(vaultPath, parsedConfig.template.trim());
    }
  } catch {
    // Missing or invalid daily-notes.json
  }

  // Priority 3: Fallback
  return undefined;
}

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Main harvester entry point: scans all matching Gemini CLI session logs across all workspaces for the target date.
 */
export async function harvestSessions(options: HarvestOptions = {}): Promise<HarvestReport> {
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error('Invalid date: expected YYYY-MM-DD');
  }

  const geminiDir = options.geminiDir || path.join(os.homedir(), '.gemini');
  const date = options.date || getLocalDateString();
  const tmpDir = path.join(geminiDir, 'tmp');

  const report: HarvestReport = {
    date,
    totalSessionsScanned: 0,
    activeProjectsCount: 0,
    projects: [],
  };

  // Check if tmp directory exists
  try {
    const stat = await fs.stat(tmpDir);
    if (!stat.isDirectory()) {
      return report;
    }
  } catch {
    return report;
  }

  const projectMap = await resolveProjectMapping(geminiDir);

  // Find all session files matching the date pattern across all tmp subdirectories
  // Pattern: <tmpDir>/*/chats/session-<date>*.jsonl
  const globPattern = path.join(tmpDir, '*', 'chats', `session-${date}*.jsonl`);
  const sessionFiles = await glob(globPattern, { windowsPathsNoEscape: true });

  report.totalSessionsScanned = sessionFiles.length;

  const projectRecapsMap = new Map<string, ProjectSessionRecap>();

  for (const file of sessionFiles) {
    // Extract tmp directory name
    // /path/to/tmp/<tmpName>/chats/session-*.jsonl
    const parts = file.split(path.sep);
    const chatsIndex = parts.lastIndexOf('chats');
    const tmpName = chatsIndex > 0 ? parts[chatsIndex - 1] : 'unknown';
    const realProjectPath = projectMap[tmpName] || '';

    const recap = await parseSessionJsonl(file, tmpName, realProjectPath);
    if (!recap) continue;

    const key = recap.projectPath || recap.projectName;
    const existing = projectRecapsMap.get(key);

    if (!existing) {
      projectRecapsMap.set(key, recap);
    } else {
      // Merge multiple sessions belonging to the same project
      for (const p of recap.userPrompts) {
        if (!existing.userPrompts.includes(p)) existing.userPrompts.push(p);
      }
      for (const t of recap.topics) {
        if (!existing.topics.includes(t)) existing.topics.push(t);
      }
      for (const a of recap.keyActions) {
        if (!existing.keyActions.includes(a)) existing.keyActions.push(a);
      }
      existing.stats.userTurnCount += recap.stats.userTurnCount;
      existing.stats.toolCallCount += recap.stats.toolCallCount;
      for (const [tool, count] of Object.entries(recap.stats.toolsUsed)) {
        existing.stats.toolsUsed[tool] = (existing.stats.toolsUsed[tool] || 0) + count;
      }
    }
  }

  report.projects = Array.from(projectRecapsMap.values());
  report.activeProjectsCount = report.projects.length;

  // Load template content if vaultPath is available (supports explicit template or auto-discovery)
  if (options.vaultPath) {
    report.templateContent = await loadTemplateContent(options.vaultPath, options.templatePath);
  }

  return report;
}
