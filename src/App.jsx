import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCalendarDays, faArrowRightFromBracket, faScissors, faChevronDown, faCheck, faTrashCan, faGraduationCap, faWallet } from '@fortawesome/free-solid-svg-icons';
import { faCalendar, faChartBar } from '@fortawesome/free-regular-svg-icons';
import Login from './components/Login';
import AddExpense from './components/AddExpense';
import ExpenseList from './components/ExpenseList';
import WeeklyBreakdown from './components/WeeklyBreakdown';
import MonthlyBreakdown from './components/MonthlyBreakdown';
import BillSplitter from './components/BillSplitter';
import SplitHistory from './components/SplitHistory';
import DebtTracker from './components/DebtTracker';
import Budget from './components/Budget';

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const IS_LOCAL = window.location.hostname === 'localhost';

export default function App() {
  const [token, setToken]       = useState(() => IS_LOCAL ? 'local' : localStorage.getItem('tally_token'));
  const isSplitPath = /^\/split\/\w+/.test(window.location.pathname);
  const [tab, setTab]           = useState(() => {
    if (isSplitPath) return 'split';
    return new URLSearchParams(window.location.search).get('tab') || 'home';
  });
  const [splitView, setSplitView] = useState('new');
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [currentAccountId, setCurrentAccountId] = useState(() => {
    const v = localStorage.getItem('tally_account_id');
    return v ? parseInt(v) : null;
  });
  const [balance, setBalance]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [homeDirty, setHomeDirty]   = useState(false);
  const [splitDirty, setSplitDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [pendingSplitView, setPendingSplitView] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');

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

  function loadBalanceForAccount(accountId) {
    const v = localStorage.getItem(`tally_balance_${accountId}`);
    setBalance(v !== null ? parseFloat(v) : null);
  }

  function handleBalanceChange(val) {
    setBalance(val);
    if (currentAccountId) {
      if (val !== null) localStorage.setItem(`tally_balance_${currentAccountId}`, val);
      else localStorage.removeItem(`tally_balance_${currentAccountId}`);
    }
  }

  useEffect(() => { if (token) fetchAll(currentAccountId); }, [token]);

  async function fetchAll(forAccountId) {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch('/api/accounts',   { headers: authHeaders(token) }),
        fetch('/api/categories', { headers: authHeaders(token) }),
      ]);
      if (aRes.status === 401) { handleLogout(); return; }
      const [aData, cData] = await Promise.all([aRes.json(), cRes.json()]);
      setAccounts(aData);
      setCategories(cData);

      let activeId = forAccountId;
      if (!activeId || !aData.find(a => a.id === activeId)) {
        activeId = aData[0]?.id ?? null;
      }
      if (activeId !== currentAccountId) {
        setCurrentAccountId(activeId);
        if (activeId) localStorage.setItem('tally_account_id', activeId);
      }

      if (activeId) {
        loadBalanceForAccount(activeId);
        const eRes = await fetch(`/api/expenses?account_id=${activeId}`, { headers: authHeaders(token) });
        if (eRes.status === 401) { handleLogout(); return; }
        setExpenses(await eRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function switchAccount(accountId) {
    setCurrentAccountId(accountId);
    localStorage.setItem('tally_account_id', accountId);
    loadBalanceForAccount(accountId);
    setExpenses([]);
    setShowAccountModal(false);
    setLoading(true);
    try {
      const eRes = await fetch(`/api/expenses?account_id=${accountId}`, { headers: authHeaders(token) });
      setExpenses(await eRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAccount() {
    if (!newAccountName.trim()) return;
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: newAccountName.trim() }),
    });
    const newAccount = await res.json();
    if (!newAccount.error) {
      setAccounts(prev => [...prev, newAccount]);
      setNewAccountName('');
    }
  }

  async function handleDeleteAccount(id) {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    const data = await res.json();
    if (!data.error) {
      localStorage.removeItem(`tally_balance_${id}`);
      setAccounts(prev => prev.filter(a => a.id !== id));
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
      body: JSON.stringify({ ...expense, account_id: currentAccountId }),
    });
    const newExp = await res.json();
    setExpenses(prev => [newExp, ...prev]);
    return newExp;
  }

  async function handleDelete(id) {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders(token) });
  }

  async function handleEdit(id, updates) {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    setExpenses(prev => prev.map(e => e.id === id ? updated : e));
    return updated;
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
    { id: 'home',    label: 'Home',    icon: faHouse,          activeIcon: faHouse },
    { id: 'weekly',  label: 'Weekly',  icon: faCalendar,       activeIcon: faCalendarDays },
    { id: 'monthly', label: 'Monthly', icon: faChartBar,       activeIcon: faChartBar },
    { id: 'budget',  label: 'Budget',  icon: faWallet,         activeIcon: faWallet },
    { id: 'debt',    label: 'Debt',    icon: faGraduationCap,  activeIcon: faGraduationCap },
    { id: 'split',   label: 'Split',   icon: faScissors,       activeIcon: faScissors },
  ];

  const titles = { home: 'tally', weekly: 'weekly', monthly: 'monthly', budget: 'budget', debt: 'debt', split: 'split' };
  const currentAccount = accounts.find(a => a.id === currentAccountId);

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
        <div className="header-right">
          {currentAccount && (
            <button className="account-pill" onClick={() => setShowAccountModal(true)}>
              {currentAccount.name}
              <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10 }} />
            </button>
          )}
          {!IS_LOCAL && (
            <button className="logout-btn" onClick={handleLogout} title="Sign out">
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </button>
          )}
        </div>
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
              onEdit={handleEdit}
              loading={loading && expenses.length === 0}
              balance={balance}
              onBalanceChange={handleBalanceChange}
            />
          </>
        )}
        {tab === 'weekly'  && <WeeklyBreakdown  categories={categories} token={token} balance={balance} expenses={expenses} accountId={currentAccountId} />}
        {tab === 'monthly' && <MonthlyBreakdown categories={categories} token={token} balance={balance} expenses={expenses} accountId={currentAccountId} />}
        {tab === 'budget'  && <Budget categories={categories} token={token} accountId={currentAccountId} expenses={expenses} />}
        {tab === 'debt'    && <DebtTracker token={token} />}
        {tab === 'split' && (
          <>
            <div className="split-subtabs">
              <button className={`split-subtab ${splitView === 'new' ? 'active' : ''}`} onClick={() => handleSplitViewChange('new')}>New</button>
              <button className={`split-subtab ${splitView === 'history' ? 'active' : ''}`} onClick={() => handleSplitViewChange('history')}>History</button>
            </div>
            {splitView === 'new'     && <BillSplitter embedded onDirtyChange={setSplitDirty} categories={categories} token={token} accountId={currentAccountId} onExpenseAdded={exp => setExpenses(prev => prev.some(e => e.id === exp.id) ? prev.map(e => e.id === exp.id ? exp : e) : [exp, ...prev])} onBillLoaded={() => window.history.replaceState(null, '', '/')} />}
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

      {showAccountModal && (
        <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <span className="modal-title">Accounts</span>
            <div className="account-list">
              {accounts.map(account => (
                <div key={account.id} className={`account-item ${account.id === currentAccountId ? 'active' : ''}`}>
                  <button className="account-item-btn" onClick={() => switchAccount(account.id)}>
                    <span className="account-item-name">{account.name}</span>
                    {account.id === currentAccountId && <FontAwesomeIcon icon={faCheck} className="account-item-check" />}
                  </button>
                  {accounts.length > 1 && account.id !== currentAccountId && (
                    <button className="account-item-delete" onClick={() => handleDeleteAccount(account.id)} title="Delete account">
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="account-new-row">
              <input
                className="text-input"
                placeholder="New account name"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
              />
              <button className="btn-primary" onClick={handleAddAccount} disabled={!newAccountName.trim()}>
                Add
              </button>
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
