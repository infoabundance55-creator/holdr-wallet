import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './docs.css';
import DocsApp from './DocsApp';
import { startDocsAnalytics } from './analytics';

startDocsAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
