import { useState, useEffect, useRef } from 'react';
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
import { localCache, syncQueue, tempId } from './offlineStore';

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const IS_LOCAL = window.location.hostname === 'localhost';

export default function App() {
  const [token, setToken]       = useState(() => IS_LOCAL ? 'local' : localStorage.getItem('tally_token'));
  const [tab, setTab]           = useState(() => new URLSearchParams(window.location.search).get('tab') || 'home');
  const [splitView, setSplitView] = useState('new');
  const [expenses, setExpenses] = useState(() => localCache.getExpenses());
  const [categories, setCategories] = useState(() => localCache.getCategories() || []);
  const [loading, setLoading]   = useState(true);
  const [homeDirty, setHomeDirty]   = useState(false);
  const [splitDirty, setSplitDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingSplitView, setPendingSplitView] = useState(null);
  const [online, setOnline]     = useState(navigator.onLine);
  const [syncing, setSyncing]   = useState(false);
  const tokenRef = useRef(token);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // Keep cache in sync with state
  useEffect(() => { localCache.setExpenses(expenses); }, [expenses]);
  useEffect(() => { if (categories.length) localCache.setCategories(categories); }, [categories]);

  // Online / offline listeners
  useEffect(() => {
    function goOnline()  { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // When connection is restored: flush queue then refresh
  useEffect(() => {
    if (online && token) flushAndRefresh();
  }, [online]);

  useEffect(() => { if (token) fetchAll(); }, [token]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [eRes, cRes] = await Promise.all([
        fetch('/api/expenses',   { headers: authHeaders(token) }),
        fetch('/api/categories', { headers: authHeaders(token) }),
      ]);
      if (eRes.status === 401) { handleLogout(); return; }
      const [eData, cData] = await Promise.all([eRes.json(), cRes.json()]);
      setExpenses(eData);
      setCategories(cData);
    } catch {
      // offline — cached data already in state from initialization
    } finally {
      setLoading(false);
    }
  }

  async function flushAndRefresh() {
    const ops = syncQueue.getAll();
    if (!ops.length) { fetchAll(); return; }

    setSyncing(true);
    const tok = tokenRef.current;
    const tempIdMap = {};

    for (const op of ops) {
      try {
        if (op.type === 'ADD_EXPENSE') {
          const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: authHeaders(tok),
            body: JSON.stringify(op.payload),
          });
          const real = await res.json();
          tempIdMap[op.tempId] = real.id;
          setExpenses(prev => prev.map(e => e.id === op.tempId ? { ...e, id: real.id } : e));
        } else if (op.type === 'DELETE_EXPENSE') {
          const id = tempIdMap[op.id] ?? op.id;
          await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders(tok) });
        } else if (op.type === 'ADD_CATEGORY') {
          const res = await fetch('/api/categories', {
            method: 'POST',
            headers: authHeaders(tok),
            body: JSON.stringify(op.payload),
          });
          const real = await res.json();
          tempIdMap[op.tempId] = real.id;
          setCategories(prev => prev.map(c => c.id === op.tempId ? { ...c, id: real.id } : c));
        }
        syncQueue.remove(op.qid);
      } catch {
        break; // network error — retry next time
      }
    }

    setSyncing(false);
    fetchAll();
  }

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
    if (pendingTab)      { setTab(pendingTab); setPendingTab(null); }
    if (pendingSplitView){ setSplitView(pendingSplitView); setPendingSplitView(null); }
  }

  function cancelLeave() {
    setPendingTab(null);
    setPendingSplitView(null);
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
    const id = tempId();
    const newExp = { id, ...expense, created_at: new Date().toISOString() };
    setExpenses(prev => [newExp, ...prev]);

    if (!online) {
      syncQueue.push({ type: 'ADD_EXPENSE', tempId: id, payload: expense });
      return newExp;
    }
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(expense),
      });
      const real = await res.json();
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, id: real.id } : e));
      return real;
    } catch {
      syncQueue.push({ type: 'ADD_EXPENSE', tempId: id, payload: expense });
      return newExp;
    }
  }

  async function handleDelete(id) {
    setExpenses(prev => prev.filter(e => e.id !== id));

    // If this was an offline-added expense, cancel the add instead of queuing a delete
    const pendingAdd = syncQueue.getAll().find(o => o.type === 'ADD_EXPENSE' && o.tempId === id);
    if (pendingAdd) { syncQueue.remove(pendingAdd.qid); return; }

    if (!online) {
      syncQueue.push({ type: 'DELETE_EXPENSE', id });
      return;
    }
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    } catch {
      syncQueue.push({ type: 'DELETE_EXPENSE', id });
    }
  }

  async function handleAddCategory(cat) {
    if (!online) {
      const id = tempId();
      const newCat = { id, ...cat };
      setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      syncQueue.push({ type: 'ADD_CATEGORY', tempId: id, payload: cat });
      return newCat;
    }
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(cat),
      });
      const newCat = await res.json();
      if (!newCat.error) setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      return newCat;
    } catch {
      const id = tempId();
      const newCat = { id, ...cat };
      setCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      syncQueue.push({ type: 'ADD_CATEGORY', tempId: id, payload: cat });
      return newCat;
    }
  }

  if (!token) return <Login onLogin={handleLogin} />;

  const tabs = [
    { id: 'home',    label: 'Home',    icon: faHouse,    activeIcon: faHouse },
    { id: 'weekly',  label: 'Weekly',  icon: faCalendar, activeIcon: faCalendarDays },
    { id: 'monthly', label: 'Monthly', icon: faChartBar, activeIcon: faChartBar },
    { id: 'split',   label: 'Split',   icon: faScissors, activeIcon: faScissors },
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

      {(!online || syncing) && (
        <div className={`sync-banner ${syncing ? 'sync-banner--syncing' : ''}`}>
          {syncing ? 'Syncing changes…' : 'Offline — changes will sync when reconnected'}
        </div>
      )}

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
              loading={loading && expenses.length === 0}
            />
          </>
        )}
        {tab === 'weekly'  && <WeeklyBreakdown  categories={categories} token={token} />}
        {tab === 'monthly' && <MonthlyBreakdown categories={categories} token={token} />}
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
