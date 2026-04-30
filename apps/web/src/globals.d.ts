/**
 * Cesium requires window.CESIUM_BASE_URL to locate its static assets.
 * We set this in main.tsx before any Cesium import.
 */
declare interface Window {
  CESIUM_BASE_URL: string;
}
