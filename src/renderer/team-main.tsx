import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './components/team/team.css';
import SingleTaskRunnerPage from './components/team/SingleTaskRunnerPage';

// #路由_Team独立入口
// Team 是外挂式独立入口壳。
// 这里不承担主家园总壳职责，只负责把 team 页面单独挂起来。
const rootElement = document.getElementById('team-root');
if (!rootElement) {
  throw new Error('Failed to find the team root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SingleTaskRunnerPage />
  </React.StrictMode>,
);
