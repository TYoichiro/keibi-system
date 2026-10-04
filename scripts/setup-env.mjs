import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const secretDirectory = new URL('.secrets/', root);
await mkdir(secretDirectory, { recursive: true, mode: 0o700 });
if (process.platform === 'win32') {
  const username = userInfo().username;
  const account = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${username}` : username;
  execFileSync('icacls', [fileURLToPath(secretDirectory), '/inheritance:r', '/grant:r',
    `${account}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { stdio: 'pipe' });
}

for (const name of ['postgres_admin_password', 'postgres_app_password']) {
  try {
    await writeFile(new URL(name, secretDirectory), randomBytes(48).toString('base64url'), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

try {
  await writeFile(new URL('.env', root), await readFile(new URL('.env.example', root)), {
    flag: 'wx',
    mode: 0o600,
  });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

console.log(`Environment files are ready in ${fileURLToPath(root)}. Existing files were preserved.`);
