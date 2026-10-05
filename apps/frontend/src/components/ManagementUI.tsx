import Icon from './Icon';
import type { IconName } from './Icon';

export type Tone = 'blue' | 'green' | 'violet' | 'amber' | 'gray';
export type SummaryItem = { label: string; value: number; unit: string; note: string; icon: IconName; tone: Tone };

export function SummaryCards({ items, label }: { items: SummaryItem[]; label: string }) {
  return (
    <section className="management-summary" aria-label={label}>
      {items.map((item) => (
        <article className={`management-stat tone-${item.tone}`} key={item.label}>
          <div><span>{item.label}</span><span className="management-stat-icon"><Icon name={item.icon} size={19} /></span></div>
          <p><strong>{item.value}</strong><span>{item.unit}</span><small>{item.note}</small></p>
        </article>
      ))}
    </section>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`management-badge tone-${tone}`}><span />{label}</span>;
}

export function PersonAvatar({ name, color, large = false }: { name: string; color: string; large?: boolean }) {
  return <span className={`person-avatar person-color-${color}${large ? ' is-large' : ''}`}>{name[0]}</span>;
}

export function ListPagination({ total, page, pageSize, onChange }: { total: number; page: number; pageSize: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  return (
    <div className="management-pagination">
      <span>{total === 0 ? '0件を表示' : `${total}件中 ${first}〜${last}件を表示`}</span>
      <nav aria-label="一覧のページ切り替え">
        <button type="button" aria-label="前のページ" disabled={page === 0} onClick={() => onChange(page - 1)}><Icon name="chevron-left" size={14} /></button>
        {Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} className={page === index ? 'is-current' : ''} aria-label={`${index + 1}ページ目`} aria-current={page === index ? 'page' : undefined} onClick={() => onChange(index)}>{index + 1}</button>)}
        <button type="button" aria-label="次のページ" disabled={page === pageCount - 1} onClick={() => onChange(page + 1)}><Icon name="chevron-right" size={14} /></button>
      </nav>
    </div>
  );
}

export function EmptyRows({ colSpan, onClear }: { colSpan: number; onClear: () => void }) {
  return <tr><td colSpan={colSpan} className="management-empty-results"><Icon name="search" size={27} /><strong>条件に一致するデータがありません</strong><p>検索キーワードや絞り込み条件を変更してください。</p><button type="button" className="secondary-button" onClick={onClear}>条件をクリア</button></td></tr>;
}
