import { managedSites } from './siteManagement';

const clientNames = [...new Set(managedSites.map((site) => site.client))];

// Fictional commercial terms for visual review; no billing calculations are performed.
export const clients = clientNames.map((name, index) => {
  const sites = managedSites.filter((site) => site.client === name);
  return {
    id: `C${String(index + 1).padStart(3, '0')}`,
    name,
    contact: sites[0].contact,
    phone: `03-0000-${String(2001 + index)}`,
    email: `client${index + 1}@example.invalid`,
    address: `東京都サンプル区見本町${index + 1}-1-1`,
    owner: index % 2 === 0 ? '田中 太郎' : '佐々木 一',
    closing: '月末締め',
    payment: index % 2 === 0 ? '翌月末払い' : '翌月25日払い',
    documentPending: index < 2,
    sites,
    note: index < 2 ? '10月末に更新する現場の継続予定と配置人数を確認してください。' : '現場ごとの勤務条件と連絡窓口は、現場詳細で確認してください。',
  };
});

export type Client = (typeof clients)[number];
export const getClient = (name: string) => clients.find((client) => client.name === name);
