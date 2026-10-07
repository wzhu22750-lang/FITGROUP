import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import {initNativeShell} from './native';
import './index.css';

// Ensure any dark theme attribute is cleared
if (typeof document !== 'undefined') {
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
}

void initNativeShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
