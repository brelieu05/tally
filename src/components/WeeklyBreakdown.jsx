import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { faCalendar } from '@fortawesome/free-regular-svg-icons';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`;
}

export default function WeeklyBreakdown({ categories, token }) {
  const [monday, setMonday] = useState(() => getMondayOfWeek(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [monday]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses/weekly?week_start=${toDateStr(monday)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function prevWeek() { setMonday(prev => addDays(prev, -7)); }
  function nextWeek() { setMonday(prev => addDays(prev, 7)); }

  const isCurrentWeek = toDateStr(monday) === toDateStr(getMondayOfWeek(new Date()));
  const todayStr = toDateStr(new Date());

  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#6B7280';

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { date: toDateStr(d), label: DAY_LABELS[d.getDay()], isToday: toDateStr(d) === todayStr };
  });

  const totalByDay = {};
  if (data?.byDay) {
    data.byDay.forEach(r => { totalByDay[r.date] = (totalByDay[r.date] || 0) + r.total; });
  }

  const dayTotals = weekDays.map(d => ({ ...d, total: totalByDay[d.date] || 0 }));
  const maxDay = Math.max(...dayTotals.map(d => d.total), 1);
  const maxCat = data?.byCategory?.length > 0 ? data.byCategory[0].total : 1;
  const totalItems = data?.byCategory?.reduce((s, c) => s + c.count, 0) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="breakdown-nav">
          <button className="nav-arrow" onClick={prevWeek}><FontAwesomeIcon icon={faChevronLeft} /></button>
          <span className="nav-period">{formatWeekLabel(monday)}</span>
          <button className="nav-arrow" onClick={nextWeek} disabled={isCurrentWeek}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>

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

        {!loading && (
          <div className="bar-section">
            <div className="bar-section-title">Daily Spending</div>
            <div className="day-bars">
              {dayTotals.map(day => (
                <div key={day.date} className="day-bar-col">
                  <div className="day-bar-track">
                    <div
                      className={`day-bar-fill ${day.isToday ? 'today' : ''} ${day.total === 0 ? 'empty' : ''}`}
                      style={{ height: day.total === 0 ? undefined : `${(day.total / maxDay) * 100}%` }}
                    />
                  </div>
                  <span className={`day-bar-label ${day.isToday ? 'today' : ''}`}>{day.label}</span>
                </div>
              ))}
            </div>
          </div>
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
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (!data?.byCategory || data.byCategory.length === 0) && (
        <div className="card">
          <div className="empty-state">
            <FontAwesomeIcon icon={faCalendar} className="empty-icon" />
            <span className="empty-text">No expenses this week</span>
          </div>
        </div>
      )}
    </div>
  );
}
