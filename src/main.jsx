import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import BillSplitter from './components/BillSplitter.jsx';
import './App.css';

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    {window.location.pathname.startsWith('/split') ? <BillSplitter /> : <App />}
  </StrictMode>
);
