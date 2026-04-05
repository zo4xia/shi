import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import SingleTaskRunnerPage from './components/team/SingleTaskRunnerPage';

const rootElement = document.getElementById('team-root');
if (!rootElement) {
  throw new Error('Failed to find the team root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SingleTaskRunnerPage />
  </React.StrictMode>,
);
