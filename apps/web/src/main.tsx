// Set CESIUM_BASE_URL before importing Cesium or Resium.
// This tells CesiumJS where to find its static assets (Workers, Assets, Widgets, ThirdParty).
// Must match the destination path used in vite.config.ts viteStaticCopy targets.
window.CESIUM_BASE_URL = '/cesium';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Ion } from 'cesium';
import App from './App.tsx';
import './index.css';

// Wire up the Cesium Ion access token from the environment.
const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
} else {
  console.warn(
    '[terrain] VITE_CESIUM_ION_TOKEN is not set. ' +
      'Copy apps/web/.env.local.example to apps/web/.env.local and fill in your token.',
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
