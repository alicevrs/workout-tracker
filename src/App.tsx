import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import TodayPage from './pages/TodayPage';

const ExercisesPage = lazy(() => import('./pages/ExercisesPage'));
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage'));
const ExerciseEditPage = lazy(() => import('./pages/ExerciseEditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  mobile: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: 'home', mobile: true },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell', mobile: true },
  { to: '/settings', label: 'Settings', icon: 'settings', mobile: true },
];

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="favicon.svg" alt="" width={28} height={28} /> Workout Tracker
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <UpdatePrompt />
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/exercises/new" element={<ExerciseEditPage />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/exercises/:id/edit" element={<ExerciseEditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="empty">Page not found.</div>} />
          </Routes>
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
