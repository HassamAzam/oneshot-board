import { hostname, userInfo, homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CFG } from './config.mjs';

/**
 * Who this desk is. Resolution order: Claude Code's own authenticated account email
 * (~/.claude.json oauthAccount.emailAddress), then git config user.email, then os_user@hostname.
 */
export function resolveOperator() {
  let userEmail = '';
  try {
    const j = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
    userEmail = String(j?.oauthAccount?.emailAddress ?? '');
  } catch { /* not logged in on this machine, or no file */ }

  let gitEmail = '';
  for (const args of [['-C', CFG.oneshotHome, 'config', 'user.email'], ['config', '--global', 'user.email']]) {
    try {
      gitEmail = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (gitEmail) break;
    } catch { /* no git, or unset */ }
  }

  const host = hostname();
  let osUser = '';
  try { osUser = userInfo().username; } catch { /* ignore */ }

  const id = userEmail || gitEmail || `${osUser || 'unknown'}@${host}`;
  return { id, user_email: userEmail || null, git_email: gitEmail || null, hostname: host, os_user: osUser || null };
}
