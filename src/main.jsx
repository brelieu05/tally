import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import BillSplitter from './components/BillSplitter.jsx';
import './App.css';

const root = createRoot(document.getElementById('root'));

const isSplitPath = window.location.pathname.startsWith('/split/');
const isLoggedIn  = !!localStorage.getItem('tally_token') || window.location.hostname === 'localhost';

root.render(
  <StrictMode>
    {isSplitPath && !isLoggedIn ? <BillSplitter /> : <App />}
  </StrictMode>
);
