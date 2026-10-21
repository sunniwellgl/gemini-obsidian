import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  harvestSessions,
  resolveProjectMapping,
  parseSessionJsonl,
  loadTemplateContent,
  getLocalDateString,
  HarvestOptions,
} from '../src/session-harvester';

describe('session-harvester', () => {
  let fakeGeminiDir: string;
  let fakeVaultDir: string;

  beforeEach(async () => {
    fakeGeminiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-harvester-test-'));
    fakeVaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-harvester-test-'));

    // Create projects.json
    const projectsConfig = {
      projects: {
        '/workspace/frontend-ui': 'frontend-tmp-1',
        '/workspace/backend-api': 'backend-tmp-2',
      },
    };
    await fs.writeFile(
      path.join(fakeGeminiDir, 'projects.json'),
      JSON.stringify(projectsConfig, null, 2),
      'utf-8'
    );

    // Create tmp chats directory
    const frontendChatDir = path.join(fakeGeminiDir, 'tmp', 'frontend-tmp-1', 'chats');
    await fs.mkdir(frontendChatDir, { recursive: true });

    const backendChatDir = path.join(fakeGeminiDir, 'tmp', 'backend-tmp-2', 'chats');
    await fs.mkdir(backendChatDir, { recursive: true });

    const emptyChatDir = path.join(fakeGeminiDir, 'tmp', 'empty-tmp-3', 'chats');
    await fs.mkdir(emptyChatDir, { recursive: true });

    // Populate frontend session with universal dev workflow
    const frontendSessionLines = [
      JSON.stringify({
        role: 'user',
        parts: [{ text: '<session_context>System Context</session_context>' }],
      }),
      JSON.stringify({
        role: 'user',
        parts: [{ text: 'Issue #1024: 修复响应式布局文字截断' }],
      }),
      JSON.stringify({
        role: 'gemini',
        toolCalls: [
          {
            name: 'update_topic',
            args: { title: '修复多语言长文本排版截断' },
          },
        ],
      }),
      JSON.stringify({
        role: 'user',
        parts: [{ text: '运行单元测试并提交变更' }],
      }),
      JSON.stringify({
        role: 'gemini',
        toolCalls: [
          {
            name: 'run_shell_command',
            args: { command: 'npm test -- --run' },
          },
          {
            name: 'run_shell_command',
            args: { command: 'git commit -m "fix(layout): resolve text truncation in responsive view"' },
          },
          {
            name: 'run_shell_command',
            args: { command: 'git push origin feat/responsive-layout' },
          },
        ],
      }),
    ];
    await fs.writeFile(
      path.join(frontendChatDir, 'session-2026-10-16T08-00-aaaa1111.jsonl'),
      frontendSessionLines.join('\n'),
      'utf-8'
    );

    // Populate backend session with standard API format and corrupted line
    const backendSessionLines = [
      JSON.stringify({
        role: 'user',
        content: 'Issue #512: 排查异步状态机时序冲突',
      }),
      'INVALID_JSON_CORRUPTED_LINE_HERE',
      JSON.stringify({
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'update_topic',
              args: { title: '异步事件时序对撞分析' },
            },
          },
          {
            functionCall: {
              name: 'obsidian_create_note',
              args: { file_path: 'Architecture/State-Machine.md' },
            },
          },
        ],
      }),
    ];
    await fs.writeFile(
      path.join(backendChatDir, 'session-2026-10-16T09-30-bbbb2222.jsonl'),
      backendSessionLines.join('\n'),
      'utf-8'
    );

    // Populate empty session
    await fs.writeFile(
      path.join(emptyChatDir, 'session-2026-10-16T10-00-cccc3333.jsonl'),
      '',
      'utf-8'
    );

    // Create multiple custom templates in fakeVaultDir
    await fs.mkdir(path.join(fakeVaultDir, 'Templates'), { recursive: true });
    await fs.writeFile(
      path.join(fakeVaultDir, 'Templates', 'Daily-Work-Log.md'),
      '# Work Log Template\n- Project: {{project}}\n- Milestones: {{milestones}}',
      'utf-8'
    );
    await fs.writeFile(
      path.join(fakeVaultDir, 'Templates', 'Personal-Review.md'),
      '# Personal Review\n- Achievements: {{accomplishments}}\n- Next Steps: {{next_steps}}',
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(fakeGeminiDir, { recursive: true, force: true });
    await fs.rm(fakeVaultDir, { recursive: true, force: true });
  });

  it('resolves project mapping from projects.json correctly', async () => {
    const mapping = await resolveProjectMapping(fakeGeminiDir);
    expect(mapping['frontend-tmp-1']).toBe('/workspace/frontend-ui');
    expect(mapping['backend-tmp-2']).toBe('/workspace/backend-api');
  });

  it('parses session jsonl and extracts user prompts, topics, and universal milestones', async () => {
    const sessionFile = path.join(
      fakeGeminiDir,
      'tmp',
      'frontend-tmp-1',
      'chats',
      'session-2026-10-16T08-00-aaaa1111.jsonl'
    );
    const recap = await parseSessionJsonl(sessionFile, 'frontend-tmp-1', '/workspace/frontend-ui');
    expect(recap).not.toBeNull();
    if (!recap) return;

    expect(recap.projectName).toBe('frontend-ui');
    expect(recap.projectPath).toBe('/workspace/frontend-ui');
    expect(recap.userPrompts).toContain('Issue #1024: 修复响应式布局文字截断');
    expect(recap.userPrompts).toContain('运行单元测试并提交变更');
    // Ensure system_context is stripped
    expect(recap.userPrompts.some((p) => p.includes('<session_context>'))).toBe(false);
    // Topics extracted
    expect(recap.topics).toContain('修复多语言长文本排版截断');
    // Universal engineering milestones extracted
    expect(recap.keyActions.some((a) => a.startsWith('Test: npm test'))).toBe(true);
    expect(recap.keyActions.some((a) => a.startsWith('VCS: git commit'))).toBe(true);
    expect(recap.keyActions.some((a) => a.startsWith('VCS: git push'))).toBe(true);
    // Tool counts
    expect(recap.stats.toolCallCount).toBeGreaterThanOrEqual(4);
    expect(recap.stats.toolsUsed['update_topic']).toBe(1);
    expect(recap.stats.toolsUsed['run_shell_command']).toBe(3);
  });

  it('handles corrupted jsonl lines gracefully without throwing', async () => {
    const sessionFile = path.join(
      fakeGeminiDir,
      'tmp',
      'backend-tmp-2',
      'chats',
      'session-2026-10-16T09-30-bbbb2222.jsonl'
    );
    const recap = await parseSessionJsonl(sessionFile, 'backend-tmp-2', '/workspace/backend-api');
    expect(recap).not.toBeNull();
    if (!recap) return;

    expect(recap.projectName).toBe('backend-api');
    expect(recap.userPrompts).toContain('Issue #512: 排查异步状态机时序冲突');
    expect(recap.topics).toContain('异步事件时序对撞分析');
    expect(recap.keyActions).toContain('Action: obsidian_create_note');
  });

  it('filters empty or zombie sessions', async () => {
    const sessionFile = path.join(
      fakeGeminiDir,
      'tmp',
      'empty-tmp-3',
      'chats',
      'session-2026-10-16T10-00-cccc3333.jsonl'
    );
    const recap = await parseSessionJsonl(sessionFile, 'empty-tmp-3', '');
    expect(recap).toBeNull();
  });

  it('harvests all sessions matching the target date across projects', async () => {
    const options: HarvestOptions = {
      date: '2026-10-16',
      geminiDir: fakeGeminiDir,
      vaultPath: fakeVaultDir,
      templatePath: 'Templates/Daily-Work-Log.md',
    };

    const report = await harvestSessions(options);
    expect(report.date).toBe('2026-10-16');
    expect(report.activeProjectsCount).toBe(2);
    expect(report.projects.map((p) => p.projectName)).toContain('frontend-ui');
    expect(report.projects.map((p) => p.projectName)).toContain('backend-api');
    expect(report.templateContent).toContain('# Work Log Template');
  });

  it('supports alternative template styles (e.g. Personal-Review.md)', async () => {
    const report = await harvestSessions({
      date: '2026-10-16',
      geminiDir: fakeGeminiDir,
      vaultPath: fakeVaultDir,
      templatePath: 'Templates/Personal-Review.md',
    });
    expect(report.templateContent).toContain('# Personal Review');
  });

  it('gracefully handles missing template without failing', async () => {
    const templateContent = await loadTemplateContent(fakeVaultDir, 'Templates/Non-Existent.md');
    expect(templateContent).toBeUndefined();
  });

  it('computes local date string in YYYY-MM-DD format', () => {
    const testDate = new Date(2026, 9, 16); // month is 0-indexed (9 = Oct)
    expect(getLocalDateString(testDate)).toBe('2026-10-16');
  });

  it('gracefully handles missing gemini directory without crashing', async () => {
    const report = await harvestSessions({
      date: '2026-10-16',
      geminiDir: '/non/existent/path/for/sure',
    });
    expect(report.activeProjectsCount).toBe(0);
    expect(report.projects).toEqual([]);
  });

  it('auto-discovers template from .obsidian/daily-notes.json when template_path is not provided', async () => {
    const obsidianDir = path.join(fakeVaultDir, '.obsidian');
    await fs.mkdir(obsidianDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianDir, 'daily-notes.json'),
      JSON.stringify({ template: 'Templates/Auto-Daily' }),
      'utf-8'
    );
    await fs.writeFile(
      path.join(fakeVaultDir, 'Templates', 'Auto-Daily.md'),
      '# Auto Discovered Template\n- Milestones: {{milestones}}',
      'utf-8'
    );

    const report = await harvestSessions({
      date: '2026-10-16',
      geminiDir: fakeGeminiDir,
      vaultPath: fakeVaultDir,
    });

    expect(report.templateContent).toContain('# Auto Discovered Template');
  });

  it('prioritizes explicit template_path over .obsidian/daily-notes.json', async () => {
    const obsidianDir = path.join(fakeVaultDir, '.obsidian');
    await fs.mkdir(obsidianDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianDir, 'daily-notes.json'),
      JSON.stringify({ template: 'Templates/Auto-Daily' }),
      'utf-8'
    );

    const report = await harvestSessions({
      date: '2026-10-16',
      geminiDir: fakeGeminiDir,
      vaultPath: fakeVaultDir,
      templatePath: 'Templates/Personal-Review.md',
    });

    expect(report.templateContent).toContain('# Personal Review');
    expect(report.templateContent).not.toContain('# Auto Discovered Template');
  });

  it('gracefully returns undefined when .obsidian/daily-notes.json is missing or lacks template field', async () => {
    const content = await loadTemplateContent(fakeVaultDir);
    expect(content).toBeUndefined();

    const obsidianDir = path.join(fakeVaultDir, '.obsidian');
    await fs.mkdir(obsidianDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianDir, 'daily-notes.json'),
      JSON.stringify({ folder: 'Daily Notes' }),
      'utf-8'
    );

    const contentWithoutTemplateField = await loadTemplateContent(fakeVaultDir);
    expect(contentWithoutTemplateField).toBeUndefined();
  });

  it('strictly rejects invalid date formats and throws an error', async () => {
    await expect(
      harvestSessions({
        date: 'invalid-date',
        geminiDir: fakeGeminiDir,
      })
    ).rejects.toThrow('Invalid date: expected YYYY-MM-DD');

    await expect(
      harvestSessions({
        date: '2026/10/20',
        geminiDir: fakeGeminiDir,
      })
    ).rejects.toThrow('Invalid date: expected YYYY-MM-DD');

    await expect(
      harvestSessions({
        date: '*',
        geminiDir: fakeGeminiDir,
      })
    ).rejects.toThrow('Invalid date: expected YYYY-MM-DD');

    await expect(
      harvestSessions({
        date: '2026-10-20/../../path',
        geminiDir: fakeGeminiDir,
      })
    ).rejects.toThrow('Invalid date: expected YYYY-MM-DD');
  });

  it('rejects path traversal attempts in template_path', async () => {
    const content = await loadTemplateContent(fakeVaultDir, '../outside.md');
    expect(content).toBeUndefined();
  });

  it('strips all internal runtime context blocks while preserving user prompt text', async () => {
    const mixedSessionFile = path.join(
      fakeGeminiDir,
      'tmp',
      'frontend-tmp-1',
      'chats',
      'session-2026-10-16T11-00-mixed111.jsonl'
    );

    const lines = [
      JSON.stringify({
        role: 'user',
        parts: [
          {
            text: '<session_context>\nSystem Context Info\n</session_context>\n<scratchpad>\nInternal scratchpad notes\n</scratchpad>\n<state_snapshot>\n{"active": true}\n</state_snapshot>\n<loaded_context>\nSome sensitive file contents\n</loaded_context>\n<extension_context>\nExtension details\n</extension_context>\n<system_note>\nSystem directive note\n</system_note>\n优化状态机转移动画性能',
          },
        ],
      }),
      JSON.stringify({
        role: 'gemini',
        toolCalls: [
          {
            name: 'update_topic',
            args: { title: '状态机转移动画优化' },
          },
        ],
      }),
    ];

    await fs.writeFile(mixedSessionFile, lines.join('\n'), 'utf-8');

    const recap = await parseSessionJsonl(mixedSessionFile, 'frontend-tmp-1', '/workspace/frontend-ui');
    expect(recap).not.toBeNull();
    if (!recap) return;

    // Preserves the real user prompt text
    expect(recap.userPrompts).toContain('优化状态机转移动画性能');

    // Asserts all internal context blocks and contents are completely stripped
    const allPromptsText = recap.userPrompts.join('\n');
    expect(allPromptsText).not.toContain('System Context Info');
    expect(allPromptsText).not.toContain('Internal scratchpad notes');
    expect(allPromptsText).not.toContain('state_snapshot');
    expect(allPromptsText).not.toContain('sensitive file contents');
    expect(allPromptsText).not.toContain('Extension details');
    expect(allPromptsText).not.toContain('System directive note');
  });

  it('filters messages that only contain internal context blocks and no user text', async () => {
    const onlyContextFile = path.join(
      fakeGeminiDir,
      'tmp',
      'empty-tmp-3',
      'chats',
      'session-2026-10-16T12-00-contextonly.jsonl'
    );

    const lines = [
      JSON.stringify({
        role: 'user',
        parts: [
          {
            text: '<loaded_context>\nSensitive context only\n</loaded_context>\n<scratchpad>scratchpad only</scratchpad>',
          },
        ],
      }),
    ];

    await fs.writeFile(onlyContextFile, lines.join('\n'), 'utf-8');

    const recap = await parseSessionJsonl(onlyContextFile, 'empty-tmp-3', '');
    expect(recap).toBeNull();
  });
});
