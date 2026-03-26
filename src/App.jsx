import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCalendarDays, faArrowRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { faCalendar, faChartBar } from '@fortawesome/free-regular-svg-icons';
import Login from './components/Login';
import AddExpense from './components/AddExpense';
import ExpenseList from './components/ExpenseList';
import WeeklyBreakdown from './components/WeeklyBreakdown';
import MonthlyBreakdown from './components/MonthlyBreakdown';

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function App() {
  const [token, setToken]       = useState(() => localStorage.getItem('tally_token'));
  const [tab, setTab]           = useState('home');
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]   = useState(true);

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
    localStorage.setItem('tally_token', newToken);
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
  ];

  const titles = { home: 'tally', weekly: 'weekly', monthly: 'monthly' };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">
          <img src="/favicon.svg" className="header-logo" alt="" />
          <span className="header-accent">tally</span>
          {tab !== 'home' && <><span className="header-divider">/</span>{titles[tab]}</>}
        </span>
        <button className="logout-btn" onClick={handleLogout} title="Sign out">
          <FontAwesomeIcon icon={faArrowRightFromBracket} />
        </button>
      </header>

      <main className="app-main">
        {tab === 'home' && (
          <>
            <AddExpense
              categories={categories}
              onAdd={handleAdd}
              onAddCategory={handleAddCategory}
            />
            <ExpenseList
              expenses={expenses}
              categories={categories}
              onDelete={handleDelete}
              loading={loading}
            />
          </>
        )}
        {tab === 'weekly'  && <WeeklyBreakdown  categories={categories} token={token} />}
        {tab === 'monthly' && <MonthlyBreakdown categories={categories} token={token} />}
      </main>

      <nav className="bottom-nav">
        {tabs.map(({ id, label, icon, activeIcon }) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
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
