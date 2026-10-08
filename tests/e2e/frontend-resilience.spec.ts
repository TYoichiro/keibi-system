import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { CompanyFixture } from '../../apps/backend/test/fixtures.js';

const fixturePath = process.env.E2E_FIXTURE_FILE;
if (!fixturePath || !process.env.E2E_BASE_URL) throw new Error('Run npm run test:e2e to use an isolated test database.');
const fixture: {a: CompanyFixture} = JSON.parse(await readFile(fixturePath, 'utf8'));

test.beforeEach(async ({context}) => {
  await context.addCookies([{name: 'keibi_session', value: fixture.a.actors.admin.cookie, url: process.env.E2E_BASE_URL!, httpOnly: true, sameSite: 'Lax'}]);
});

test('保存後に応答が途切れても入力を保持し結果照会で二重登録を防ぐ', async ({page, context}) => {
  let dropped = false;
  await page.route('**/api/officers', async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/officers/new');
  await page.getByLabel(/^隊員コード/).fill('G_LOST_UI');
  await page.getByLabel(/^氏名/).fill('応答喪失の試験隊員');
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('通信が途切れました');
  await expect(page.getByLabel(/^氏名/)).toHaveValue('応答喪失の試験隊員');
  await page.getByRole('button', {name: '保存結果を確認', exact: true}).click();
  await expect(page).toHaveURL(/\/officers$/);
  const response = await context.request.get('/api/officers?q=G_LOST_UI');
  expect(response.status()).toBe(200);
  const value = await response.json();
  expect(value.total).toBe(1);
  expect(value.data[0].name).toBe('応答喪失の試験隊員');
});

test('更新競合でフォームを上書きせず保存前の入力と理由を保持する', async ({page, context}) => {
  await page.goto(`/officers/edit?officer=${fixture.a.officerId}`);
  await page.getByLabel(/^氏名/).fill('競合中に入力した氏名');
  await page.getByLabel(/^変更理由/).fill('別担当者との同時編集を検証');
  const current = await context.request.get(`/api/officers/${fixture.a.officerId}`);
  const {data} = await current.json();
  const response = await context.request.patch(`/api/officers/${fixture.a.officerId}`, {
    headers: {Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': fixture.a.actors.admin.csrfToken, 'Idempotency-Key': crypto.randomUUID()},
    data: {expectedVersion: data.version, reason: '先行する同時編集', businessPhone: '000-4444-4444'},
  });
  expect(response.status()).toBe(200);
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('VERSION_CONFLICT');
  await expect(page.getByLabel(/^氏名/)).toHaveValue('競合中に入力した氏名');
  await expect(page.getByLabel(/^変更理由/)).toHaveValue('別担当者との同時編集を検証');
  const after = await context.request.get(`/api/officers/${fixture.a.officerId}`);
  expect((await after.json()).data.name).toBe('田中 和也');
});

test('変更履歴で操作者・理由・変更前後の保存内容を表示する', async ({page, context}) => {
  const current = await context.request.get(`/api/officers/${fixture.a.officerId}`);
  const {data} = await current.json();
  const reason = '履歴画面の業務電話変更を検証';
  const nextPhone = '000-5555-5555';
  const response = await context.request.patch(`/api/officers/${fixture.a.officerId}`, {
    headers: {Origin: process.env.E2E_BASE_URL!, 'X-CSRF-Token': fixture.a.actors.admin.csrfToken, 'Idempotency-Key': crypto.randomUUID()},
    data: {expectedVersion: data.version, reason, businessPhone: nextPhone},
  });
  expect(response.status()).toBe(200);
  await page.goto(`/officers?officer=${fixture.a.officerId}`);
  await page.getByRole('button', {name: '変更履歴を確認', exact: true}).click();
  const entry = page.locator('.live-history > li').filter({hasText: reason});
  await expect(entry).toContainText('操作者: 試験 admin');
  await expect(entry).toContainText(reason);
  await entry.getByText('変更内容を確認', {exact: true}).click();
  const field = entry.getByRole('row').filter({hasText: '業務電話'});
  await expect(field).toContainText(data.businessPhone);
  await expect(field).toContainText(nextPhone);
});

test('招待メールのinvitationクエリから本人メール・期限・Google連携導線を表示する', async ({page}) => {
  // UI-only contract check; real invitation issue/consumption/expiry are covered by auth.test.ts.
  const token = 'A'.repeat(43);
  await page.route(`**/api/auth/invitations/${token}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({data: {
      displayName: '招待の試験利用者', invitationEmail: 'invite-ui-test@gmail.com', companyName: '招待試験の架空会社',
      branchName: '本店', role: 'guard', expiresAt: '2026-10-10T00:00:00Z',
    }}),
  }));
  await page.goto(`/account/activate?invitation=${token}`);
  await expect(page.getByText('招待の試験利用者 様', {exact: true})).toBeVisible();
  await expect(page.getByText('本人Googleメール: invite-ui-test@gmail.com', {exact: true})).toBeVisible();
  await expect(page.getByText(/^有効期限:/)).toContainText('2026/10/10');
  await expect(page.getByRole('link', {name: '本人のGoogleアカウントで連携する'})).toHaveAttribute('href', `/api/auth/google/start?returnTo=%2F&invitation=${token}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
