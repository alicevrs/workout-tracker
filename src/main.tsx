import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ensureSeeded, getSettings, requestPersistentStorage, saveSettings } from './db/repo';
import { ToastProvider } from './components/ui';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/archivo/latin-700.css';
import '@fontsource/archivo/latin-800.css';
import './styles.css';

async function boot() {
  try {
    await ensureSeeded();
  } catch (e) {
    console.error('Seeding failed', e);
  }
  // Ask once on first launch; Settings shows the current status and lets the user ask again.
  try {
    const settings = await getSettings();
    if (!settings.persistRequested) {
      await requestPersistentStorage();
      await saveSettings({ persistRequested: true });
    }
  } catch {
    /* not supported */
  }
}

void boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
