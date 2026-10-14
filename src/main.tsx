import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { db } from './db/db';
import { migrateProgramsToWorkouts } from './lib/workouts';
import { timersFromBlocksOnce } from './lib/timerTemplates';
import { removeEmptyBlocks } from './lib/blockTemplates';
import { ensureSeeded, getSettings, requestPersistentStorage, saveSettings } from './db/repo';
import { ToastProvider } from './components/ui';
import { startSync } from './lib/sync/sync';
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
    await migrateProgramsToWorkouts(db);
    await timersFromBlocksOnce(db);
    await removeEmptyBlocks(db);
  } catch (e) {
    console.error('Startup migration failed', e);
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

void boot().then(startSync);

// Opening screen: stays 3 s from the start of loading, then fades out.
const splash = document.getElementById('splash');
if (splash) {
  const wait = Math.max(0, 3000 - performance.now());
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }, wait);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
