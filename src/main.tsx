import { render } from 'preact';
import { Shell } from './app/Shell';
import './styles/app.css';
import './styles/screens.css';

render(<Shell />, document.getElementById('app')!);

// Offline support (see src/service-worker.js). Only in the published app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
