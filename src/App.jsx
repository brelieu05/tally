import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCalendarDays, faArrowRightFromBracket, faScissors } from '@fortawesome/free-solid-svg-icons';
import { faCalendar, faChartBar } from '@fortawesome/free-regular-svg-icons';
import Login from './components/Login';
import AddExpense from './components/AddExpense';
import ExpenseList from './components/ExpenseList';
import WeeklyBreakdown from './components/WeeklyBreakdown';
import MonthlyBreakdown from './components/MonthlyBreakdown';
import BillSplitter from './components/BillSplitter';
import SplitHistory from './components/SplitHistory';

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const IS_LOCAL = window.location.hostname === 'localhost';

export default function App() {
  const [token, setToken]       = useState(() => IS_LOCAL ? 'local' : localStorage.getItem('tally_token'));
  const [tab, setTab]           = useState(() => new URLSearchParams(window.location.search).get('tab') || 'home');
  const [splitView, setSplitView] = useState('new'); // 'new' | 'history'
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [balance, setBalance]   = useState(() => {
    const v = localStorage.getItem('tally_balance');
    return v !== null ? parseFloat(v) : null;
  });
  const [homeDirty, setHomeDirty]   = useState(false);
  const [splitDirty, setSplitDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);

  const [pendingSplitView, setPendingSplitView] = useState(null);

  function handleTabChange(newTab) {
    if (newTab === tab) return;
    const dirty = (tab === 'home' && homeDirty) || (tab === 'split' && splitDirty && splitView === 'new');
    if (dirty) { setPendingTab(newTab); return; }
    setTab(newTab);
  }

  function handleSplitViewChange(newView) {
    if (newView === splitView) return;
    if (splitDirty && splitView === 'new') { setPendingSplitView(newView); return; }
    setSplitView(newView);
  }

  function confirmLeave() {
    if (pendingTab) { setTab(pendingTab); setPendingTab(null); }
    if (pendingSplitView) { setSplitView(pendingSplitView); setPendingSplitView(null); }
  }

  function cancelLeave() {
    setPendingTab(null);
    setPendingSplitView(null);
  }

  useEffect(() => {
    if (balance !== null) localStorage.setItem('tally_balance', balance);
    else localStorage.removeItem('tally_balance');
  }, [balance]);

  useEffect(() => { if (token) fetchAll(); }, [token]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [eRes, cRes] = await Promise.all([
        fetch('/api/expenses',  { headers: authHeaders(token) }),
        fetch('/api/categories', { headers: authHeaders(token) }),
      ]);
      if (eRes.status === 401) { handleLogout(); return; }
      const [eData, cData] = await Promise.all([eRes.json(), cRes.json()]);
      setExpenses(eData);
      setCategories(cData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(newToken) {
    if (!IS_LOCAL) localStorage.setItem('tally_token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('tally_token');
    setToken(null);
  }

  async function handleAdd(expense) {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(expense),
    });
    const newExp = await res.json();
    setExpenses(prev => [newExp, ...prev]);
    return newExp;
  }

  async function handleDelete(id) {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders(token) });
  }

  async function handleAddCategory(cat) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cat),
    });
    const newCat = await res.json();
    if (!newCat.error) setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
    return newCat;
  }

  if (!token) return <Login onLogin={handleLogin} />;

  const tabs = [
    { id: 'home',    label: 'Home',    icon: faHouse,      activeIcon: faHouse },
    { id: 'weekly',  label: 'Weekly',  icon: faCalendar,   activeIcon: faCalendarDays },
    { id: 'monthly', label: 'Monthly', icon: faChartBar,   activeIcon: faChartBar },
    { id: 'split',   label: 'Split',   icon: faScissors,   activeIcon: faScissors },
  ];

  const titles = { home: 'tally', weekly: 'weekly', monthly: 'monthly', split: 'split' };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">
          <button className="header-home-btn" onClick={() => handleTabChange('home')}>
            <img src="/favicon.svg" className="header-logo" alt="" />
            <span className="header-accent">tally</span>
          </button>
          {tab !== 'home' && (
            <>
              <span className="header-divider">/</span>
              {tab === 'split'
                ? <button className="header-section-btn" onClick={() => handleTabChange('split')}>{titles[tab]}</button>
                : <span>{titles[tab]}</span>
              }
            </>
          )}
        </span>
        {!IS_LOCAL && (
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <FontAwesomeIcon icon={faArrowRightFromBracket} />
          </button>
        )}
      </header>

      <main className="app-main">
        {tab === 'home' && (
          <>
            <AddExpense
              categories={categories}
              onAdd={handleAdd}
              onAddCategory={handleAddCategory}
              onDirtyChange={setHomeDirty}
            />
            <ExpenseList
              expenses={expenses}
              categories={categories}
              onDelete={handleDelete}
              loading={loading}
              balance={balance}
              onBalanceChange={setBalance}
            />
          </>
        )}
        {tab === 'weekly'  && <WeeklyBreakdown  categories={categories} token={token} balance={balance} expenses={expenses} />}
        {tab === 'monthly' && <MonthlyBreakdown categories={categories} token={token} balance={balance} expenses={expenses} />}
        {tab === 'split' && (
          <>
            <div className="split-subtabs">
              <button className={`split-subtab ${splitView === 'new' ? 'active' : ''}`} onClick={() => handleSplitViewChange('new')}>New</button>
              <button className={`split-subtab ${splitView === 'history' ? 'active' : ''}`} onClick={() => handleSplitViewChange('history')}>History</button>
            </div>
            {splitView === 'new'     && <BillSplitter embedded onDirtyChange={setSplitDirty} />}
            {splitView === 'history' && <SplitHistory token={token} />}
          </>
        )}
      </main>

      {(pendingTab || pendingSplitView) && (
        <div className="modal-overlay" onClick={cancelLeave}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <span className="modal-title">Leave tab?</span>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
              You have unsaved input. If you leave, it will be cleared.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelLeave}>Stay</button>
              <button className="btn-primary" onClick={confirmLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        {tabs.map(({ id, label, icon, activeIcon }) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'active' : ''}`}
            onClick={() => handleTabChange(id)}
          >
            <span className="nav-icon">
              <FontAwesomeIcon icon={tab === id ? activeIcon : icon} />
            </span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
