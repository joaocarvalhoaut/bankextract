import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const RESULT_LEVELS = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
};

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const clean = token.slice(2);
    const [key, ...rest] = clean.split('=');
    args[key] = rest.length ? rest.join('=') : 'true';
  }
  return args;
}

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function loadEnvironment(options = {}) {
  const cwd = options.cwd || process.cwd();
  const files = options.files || ['.env', '.env.local', '.env.secrets'];
  const merged = {};

  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || /^\s*#/.test(line)) continue;
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      merged[key] = stripWrappingQuotes(rawValue);
    }
  }

  return {
    ...merged,
    ...process.env,
  };
}

export function getEnvValue(env, key, fallbacks = []) {
  const keys = [key, ...fallbacks];
  for (const current of keys) {
    const value = String(env?.[current] || '').trim();
    if (value) return value;
  }
  return '';
}

export function toBoolean(value, defaultValue = false) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
}

export function maskSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

export function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
  return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
}

export function extractDriveFolderId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

export function createResult(level, message, nextAction, extras = {}) {
  return {
    ok: level === RESULT_LEVELS.OK,
    warning: level === RESULT_LEVELS.WARNING,
    error: level === RESULT_LEVELS.ERROR,
    level,
    message,
    next_action: nextAction,
    ...extras,
  };
}

export function summarizeResults(results = []) {
  const summary = {
    ok: results.filter((item) => item.level === RESULT_LEVELS.OK).length,
    warning: results.filter((item) => item.level === RESULT_LEVELS.WARNING).length,
    error: results.filter((item) => item.level === RESULT_LEVELS.ERROR).length,
  };
  summary.overall =
    summary.error > 0 ? RESULT_LEVELS.ERROR : summary.warning > 0 ? RESULT_LEVELS.WARNING : RESULT_LEVELS.OK;
  return summary;
}

export function printReport(title, results = [], metadata = {}) {
  const summary = summarizeResults(results);
  console.log(`=== ${title} ===`);
  if (Object.keys(metadata).length) {
    console.log(`metadata: ${JSON.stringify(metadata, null, 2)}`);
  }
  for (const item of results) {
    console.log(`[${item.level.toUpperCase()}] ${item.message}`);
    console.log(`  next_action: ${item.next_action}`);
  }
  console.log(`summary: ${JSON.stringify(summary, null, 2)}`);
  return { title, metadata, results, summary };
}

export function toMarkdownReport(report) {
  const lines = [
    `# ${report.title}`,
    '',
    `- generated_at: ${new Date().toISOString()}`,
    `- overall: ${report.summary.overall}`,
    `- ok: ${report.summary.ok}`,
    `- warning: ${report.summary.warning}`,
    `- error: ${report.summary.error}`,
    '',
  ];

  if (report.metadata && Object.keys(report.metadata).length) {
    lines.push('## Metadata', '', '```json', JSON.stringify(report.metadata, null, 2), '```', '');
  }

  lines.push('## Results', '');
  for (const item of report.results) {
    lines.push(`- ${item.level.toUpperCase()}: ${item.message}`);
    lines.push(`  next_action: ${item.next_action}`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeMarkdownReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toMarkdownReport(report), 'utf8');
  return filePath;
}

export function getRepoRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

export function createSupabaseClients(env) {
  const supabaseUrl = getEnvValue(env, 'SUPABASE_URL', ['VITE_SUPABASE_URL']);
  const serviceRoleKey = getEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = getEnvValue(env, 'SUPABASE_ANON_KEY', ['VITE_SUPABASE_ANON_KEY']);

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    admin:
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
        : null,
    anon:
      supabaseUrl && anonKey
        ? createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
        : null,
  };
}

export function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    text,
    data: safeJsonParse(text, {}),
  };
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function sanitizeErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'Erro inesperado.');
}
