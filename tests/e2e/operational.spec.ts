import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { CompanyFixture } from '../../apps/backend/test/fixtures.js';

const fixturePath = process.env.E2E_FIXTURE_FILE;
if (!fixturePath || !process.env.E2E_BASE_URL) throw new Error('Run npm run test:e2e so tests use an isolated database.');
const fixture: {a: CompanyFixture; b: CompanyFixture; publishedSlotId: string} = JSON.parse(await readFile(fixturePath, 'utf8'));
const consoleFailures = new WeakMap<Page, string[]>();
const screenshotDirectory = fileURLToPath(new URL('../../docs/mockups/', import.meta.url));

async function login(context: BrowserContext, actor = 'admin', company = fixture.a) {
  await context.addCookies([{name: 'keibi_session', value: company.actors[actor].cookie, url: process.env.E2E_BASE_URL!, httpOnly: true, sameSite: 'Lax'}]);
}
async function loaded(page: Page) {
  await expect(page.locator('.live-loading')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
test.beforeEach(({page}) => {
  const failures: string[] = [];
  consoleFailures.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
});
test.afterEach(({page}) => expect(consoleFailures.get(page)).toEqual([]));

test('未認証の直接URLは業務データを表示せずGoogleログインを案内する', async ({page}) => {
  await page.goto('/officers');
  await expect(page.getByRole('heading', {name: 'Googleでログイン'})).toBeVisible();
  await expect(page.getByText('試験用の非公開管制メモ')).toHaveCount(0);
  await page.screenshot({path: `${screenshotDirectory}/live-login-desktop.png`, fullPage: true});
});

test('隊員を登録・再読込・更新しDB保存を確認する', async ({page, context}) => {
  await login(context);
  await page.goto('/officers/new');
  await expect(page.getByLabel(/^氏名/)).toBeVisible();
  await page.getByLabel(/^隊員コード/).fill('G_BROWSER');
  await page.getByLabel(/^氏名/).fill('ブラウザ 試験隊員');
  await page.getByLabel('業務電話', {exact: true}).fill('000-3333-3333');
  await page.getByLabel('内部メモ（本人に非公開）').fill('ブラウザ試験の内部メモ');
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page).toHaveURL(/\/officers$/);
  await expect(page.getByText('ブラウザ 試験隊員', {exact: true})).toBeVisible();
  await page.reload();
  const row = page.getByRole('row').filter({hasText: 'G_BROWSER'});
  await row.getByRole('button', {name: '詳細', exact: true}).click();
  await expect(page.getByText('ブラウザ試験の内部メモ', {exact: true})).toBeVisible();
  await page.getByRole('link', {name: '基本情報を編集'}).click();
  await page.getByLabel(/^氏名/).fill('ブラウザ 更新隊員');
  await page.getByLabel(/^変更理由/).fill('ブラウザ試験で氏名を訂正');
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page).toHaveURL(/\/officers$/);
  await page.reload();
  await expect(page.getByText('ブラウザ 更新隊員', {exact: true})).toBeVisible();
});

test('取引先と現場の登録をブラウザから保存する', async ({page, context}) => {
  await login(context);
  await page.goto('/clients/new');
  await page.getByLabel(/^取引先コード/).fill('C_BROWSER');
  await page.getByLabel(/^取引先名/).fill('ブラウザ架空取引先');
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.reload();
  await expect(page.getByText('ブラウザ架空取引先', {exact: true})).toBeVisible();
  await page.goto('/sites/new');
  await page.getByLabel(/^現場コード/).fill('S_BROWSER');
  await page.getByLabel(/^現場名/).fill('ブラウザ試験現場');
  await page.getByLabel(/^取引先/).selectOption(fixture.a.clientId);
  await page.getByRole('combobox', {name: '状態', exact: true}).selectOption('active');
  await page.getByLabel(/^所在地/).fill('架空市 試験2-2');
  await page.getByLabel(/^集合場所/).fill('試験現場の東側受付');
  await page.getByRole('button', {name: '保存する', exact: true}).click();
  await expect(page).toHaveURL(/\/sites$/);
  await page.reload();
  await expect(page.getByText('ブラウザ試験現場', {exact: true})).toBeVisible();
});

test('配置の不足拒否・確定・改訂・担当解除・取消が本人予定へ反映される', async ({page, context, browser}) => {
  await login(context);
  const guardContext = await browser.newContext({baseURL: process.env.E2E_BASE_URL});
  await login(guardContext, 'secondGuard');
  try {
    const ownDuties = async () => {
      const response = await guardContext.request.get('/api/me/duties?from=2026-10-05&to=2026-10-05');
      expect(response.status()).toBe(200);
      return (await response.json()).data;
    };
    await page.goto('/assignments/new');
    await page.getByRole('combobox', {name: /^現場/}).selectOption(fixture.a.siteId);
    await page.getByLabel(/^勤務日/).fill('2026-10-05');
    await page.getByLabel(/^開始日時/).fill('2026-10-05T09:00');
    await page.getByLabel(/^終了日時/).fill('2026-10-05T18:00');
    await page.getByLabel(/^必要人数/).fill('2');
    await page.getByLabel('鈴木 一郎 (G002)', {exact: true}).check();
    await page.getByLabel('本人の勤務可能を別の連絡手段で確認済み').check();
    await page.getByLabel('移動時間・休息時間を確認済み').check();
    await page.getByRole('button', {name: '下書きを保存', exact: true}).click();
    await expect(page).toHaveURL(/\/assignments\?date=2026-10-05/);
    expect(await ownDuties()).toEqual([]);
    await page.getByRole('row').filter({hasText: '2026-10-05'}).getByRole('button', {name: '詳細', exact: true}).click();
    const slotId = new URL(page.url()).searchParams.get('duty');
    expect(slotId).toBeTruthy();
    const execute = async (reason: string) => {
      await page.getByLabel(/^操作理由/).fill(reason);
      const contact = page.getByLabel('関係者への連絡は会社の連絡手段で行います');
      if (await contact.count()) await contact.check();
      await page.getByRole('button', {name: '確認して実行', exact: true}).click();
    };
    await page.getByRole('button', {name: '配置を確定・公開', exact: true}).click();
    await execute('人数不足の拒否を確認');
    await expect(page.getByRole('alert')).toContainText('DUTY_CONDITIONS_NOT_MET');
    expect(await ownDuties()).toEqual([]);
    await page.getByRole('link', {name: '下書きを編集'}).click();
    await page.getByLabel('田中 和也 (G001)', {exact: true}).check();
    await page.getByLabel('本人の勤務可能を別の連絡手段で確認済み').check();
    await page.getByLabel('移動時間・休息時間を確認済み').check();
    await page.getByLabel(/^登録・変更理由/).fill('不足人数を補充');
    await page.getByRole('button', {name: '下書きを保存', exact: true}).click();
    await page.getByRole('button', {name: '配置を確定・公開', exact: true}).click();
    await execute('確認を終えて配置を公開');
    await expect(page.getByRole('button', {name: '改訂下書きを作成', exact: true})).toBeVisible();
    expect(await ownDuties()).toHaveLength(1);
    expect((await ownDuties())[0].state).toBe('confirmed');
    await page.reload();
    await expect(page.getByRole('button', {name: '改訂下書きを作成', exact: true})).toBeVisible();
    await page.getByRole('button', {name: '改訂下書きを作成', exact: true}).click();
    await execute('担当隊員の変更');
    await expect(page.getByRole('link', {name: '下書きを編集'})).toBeVisible();
    expect((await ownDuties())[0].state).toBe('confirmed');
    await page.getByRole('link', {name: '下書きを編集'}).click();
    await page.getByLabel('鈴木 一郎 (G002)', {exact: true}).uncheck();
    await page.getByLabel('田中 和也を現場責任者にする', {exact: true}).check();
    await page.getByLabel(/^必要人数/).fill('1');
    await page.getByLabel('本人の勤務可能を別の連絡手段で確認済み').check();
    await page.getByLabel('移動時間・休息時間を確認済み').check();
    await page.getByLabel(/^登録・変更理由/).fill('現場の必要人数を変更して担当を解除');
    await page.getByRole('button', {name: '下書きを保存', exact: true}).click();
    await page.getByRole('button', {name: '改訂を再確定', exact: true}).click();
    await execute('改訂内容を再確定');
    await expect(page.getByRole('button', {name: '改訂下書きを作成', exact: true})).toBeVisible();
    expect((await ownDuties())[0].state).toBe('removed');
    expect((await guardContext.request.get(`/api/me/duties/${slotId}/site`)).status()).toBe(404);
    await page.getByRole('button', {name: '勤務枠全体を取消', exact: true}).click();
    await execute('現場中止を確認');
    await expect(page.getByRole('button', {name: '勤務枠全体を取消', exact: true})).toHaveCount(0);
    const currentGuard = await context.request.get(`/api/me/duties/${slotId}/site`, {headers: {Cookie: `keibi_session=${fixture.a.actors.guard.cookie}`}});
    expect(currentGuard.status()).toBe(404);
  } finally { await guardContext.close(); }
});

test('閲覧者に更新UIと非公開隊員項目を提供しない', async ({page, context}) => {
  await login(context, 'viewer');
  await page.goto(`/officers?officer=${fixture.a.officerId}`);
  await loaded(page);
  await expect(page.getByRole('heading', {name: '田中 和也'})).toBeVisible();
  await expect(page.getByRole('link', {name: '隊員を登録'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: '基本情報を編集'})).toHaveCount(0);
  await expect(page.getByText('試験用の非公開管制メモ')).toHaveCount(0);
  const response = await context.request.get(`/api/officers/${fixture.a.officerId}`);
  expect(response.status()).toBe(200);
  const {data} = await response.json();
  expect(data).not.toHaveProperty('internalMemo');
  expect(data).not.toHaveProperty('businessPhone');
});

test('他社のIDで詳細を指定しても業務情報を取得できない', async ({page, context}) => {
  await login(context);
  await page.goto(`/sites?site=${fixture.b.siteId}`);
  await expect(page.getByRole('alert')).toContainText('NOT_FOUND');
  const response = await context.request.get(`/api/sites/${fixture.b.siteId}`);
  expect(response.status()).toBe(404);
});

test('警備員は本人の確定予定と担当現場だけ取得できる', async ({page, context}) => {
  await login(context, 'guard');
  await page.goto('/guard/schedule');
  await expect(page.getByText('駅前工事現場', {exact: true}).first()).toBeVisible();
  await loaded(page);
  const response = await context.request.get(`/api/me/duties/${fixture.publishedSlotId}/site`);
  expect(response.status()).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain('非公開の契約メモ');
  expect((await context.request.get('/api/officers')).status()).toBe(403);
  await page.goto(`/guard/site?duty=${fixture.publishedSlotId}`);
  await expect(page.getByText('東口の試験受付', {exact: true})).toBeVisible();
  await page.screenshot({path: `${screenshotDirectory}/live-guard-site-desktop.png`, fullPage: true});
});

for (const viewport of [{name: 'desktop', width: 1440, height: 1000}, {name: 'mobile', width: 390, height: 844}]) {
  test(`主要画面が${viewport.name}で収まり保存データを表示する`, async ({page, context}) => {
    await login(context);
    await page.setViewportSize(viewport);
    for (const [path, name, heading] of [['/', 'dashboard', 'ダッシュボード'], ['/officers', 'officers', '隊員管理'], ['/clients', 'clients', '取引先管理'], ['/sites', 'sites', '現場管理'], ['/assignments', 'assignments', '配置・管理'], ['/settings', 'settings', '会社・利用者設定']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
      await loaded(page);
      await noOverflow(page);
      await page.screenshot({path: `${screenshotDirectory}/live-${name}-${viewport.name}.png`, fullPage: true});
    }
  });
}

test('警備員のスマートフォン画面とGoogle連携画面を確認する', async ({page, context}) => {
  await login(context, 'guard');
  await page.setViewportSize({width: 390, height: 844});
  for (const [path, name] of [['/guard', 'guard-home'], ['/guard/schedule', 'guard-schedule'], [`/guard/site?duty=${fixture.publishedSlotId}`, 'guard-site'], ['/guard/profile', 'guard-profile'], ['/account/security', 'security']]) {
    await page.goto(path);
    await loaded(page);
    await noOverflow(page);
    await page.screenshot({path: `${screenshotDirectory}/live-${name}-mobile.png`, fullPage: true});
  }
});

test('ログアウトでアプリセッションと表示を無効にする', async ({page, context}) => {
  // Own session avoids invalidating fixtures used by the earlier checks.
  await login(context, 'branchDispatcher');
  await page.goto('/account/security');
  await page.getByRole('button', {name: 'この端末をログアウト', exact: true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', {name: 'Googleでログイン'})).toBeVisible();
  expect((await context.request.get('/api/me')).status()).toBe(401);
  await page.goto('/officers');
  await expect(page.getByRole('heading', {name: 'Googleでログイン'})).toBeVisible();
});
