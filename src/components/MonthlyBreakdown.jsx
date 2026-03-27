import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { faChartBar } from '@fortawesome/free-regular-svg-icons';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function getYearMonth(date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export default function MonthlyBreakdown({ categories, token, balance, expenses }) {
  const [current, setCurrent] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const { year, month } = getYearMonth(current);

  useEffect(() => { fetchData(); }, [year, month]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/monthly?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const isCurrentMonth = (() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  })();

  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#6B7280';
  const maxCat = data?.byCategory?.length > 0 ? data.byCategory[0].total : 1;
  const totalItems = data?.byCategory?.reduce((s, c) => s + c.count, 0) || 0;
  const weekLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];

  const periodStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEndStr   = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
  const allEntries     = expenses || [];
  const totalAllSpent  = allEntries.filter(e => e.type !== 'income').reduce((s, e) => s + Number(e.amount), 0);
  const totalAllIncome = allEntries.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
  const currentBalance = balance !== null ? balance - totalAllSpent + totalAllIncome : null;

  const spentAfterPeriod  = allEntries.filter(e => e.type !== 'income' && e.date > periodEndStr).reduce((s, e) => s + Number(e.amount), 0);
  const incomeAfterPeriod = allEntries.filter(e => e.type === 'income'  && e.date > periodEndStr).reduce((s, e) => s + Number(e.amount), 0);
  const periodIncome      = allEntries.filter(e => e.type === 'income'  && e.date >= periodStartStr && e.date <= periodEndStr).reduce((s, e) => s + Number(e.amount), 0);

  const balanceAfter  = balance !== null ? currentBalance + spentAfterPeriod - incomeAfterPeriod : null;
  const balanceBefore = balance !== null ? balanceAfter + Number(data?.total || 0) - periodIncome : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="breakdown-nav">
          <button className="nav-arrow" onClick={() => setCurrent(prev => addMonths(prev, -1))}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <span className="nav-period">{MONTH_NAMES[month - 1]} {year}</span>
          <button className="nav-arrow" onClick={() => setCurrent(prev => addMonths(prev, 1))} disabled={isCurrentMonth}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>

        {!loading && balance !== null && (
          <div className="period-balance-row">
            <div className="period-balance-col">
              <span className="period-balance-label">Start</span>
              <span className="period-balance-amount">${balanceBefore.toFixed(2)}</span>
            </div>
            <span className="period-balance-arrow">→</span>
            <div className="period-balance-col period-balance-col--right">
              <span className="period-balance-label">End</span>
              <span className={`period-balance-amount${balanceAfter < 0 ? ' balance-negative' : ''}`}>
                ${balanceAfter.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <div className="total-block">
          <div className="total-label">Total Spent</div>
          {loading ? (
            <div className="spinner" style={{ margin: '8px 0' }} />
          ) : (
            <>
              <div className="total-amount">${Number(data?.total || 0).toFixed(2)}</div>
              <div className="total-count">{totalItems} transaction{totalItems !== 1 ? 's' : ''}</div>
            </>
          )}
        </div>

        {!loading && data?.byWeek?.length > 0 && (
          <>
            <div className="divider" />
            <div className="bar-section">
              <div className="bar-section-title">By Week</div>
              {(() => {
                const maxWeek = Math.max(...(data.byWeek.map(w => w.total)), 1);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.byWeek.map(w => (
                      <div key={w.week_num} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {weekLabels[w.week_num - 1] || `Week ${w.week_num}`}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                            ${Number(w.total).toFixed(2)}
                          </span>
                        </div>
                        <div className="cat-bar-track">
                          <div className="cat-bar-fill" style={{ width: `${(w.total / maxWeek) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {!loading && data?.byCategory?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">By Category</span>
          </div>
          <div className="cat-bars">
            {data.byCategory.map(cat => (
              <div key={cat.category} className="cat-bar-row">
                <div className="cat-bar-top">
                  <span className="cat-bar-name">
                    <span className="cat-dot" style={{ background: colorFor(cat.category) }} />
                    {cat.category}
                  </span>
                  <span className="cat-bar-meta">
                    <span className="cat-bar-count">{cat.count}×</span>
                    <span className="cat-bar-amount">${Number(cat.total).toFixed(2)}</span>
                  </span>
                </div>
                <div className="cat-bar-track">
                  <div
                    className="cat-bar-fill"
                    style={{
                      width: `${(cat.total / maxCat) * 100}%`,
                      background: colorFor(cat.category),
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {((cat.total / (data.total || 1)) * 100).toFixed(0)}% of total
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (!data?.byCategory || data.byCategory.length === 0) && (
        <div className="card">
          <div className="empty-state">
            <FontAwesomeIcon icon={faChartBar} className="empty-icon" />
            <span className="empty-text">No expenses this month</span>
          </div>
        </div>
      )}
    </div>
  );
}
