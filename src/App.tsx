import { Suspense } from 'react';
import { lazyPage as lazy } from './lib/lazyPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import TodayPage from './pages/TodayPage';
import { isStravaRedirect, StravaRedirectNotice } from './strava';

const stravaRedirect = isStravaRedirect();

const ExercisesPage = lazy(() => import('./pages/ExercisesPage'));
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage'));
const ExerciseEditPage = lazy(() => import('./pages/ExerciseEditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage'));
const WorkoutEditPage = lazy(() => import('./pages/WorkoutEditPage'));
const WorkoutPage = lazy(() => import('./pages/WorkoutPage'));
const TimerPage = lazy(() => import('./pages/TimerPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ActivityFormPage = lazy(() => import('./pages/ActivityFormPage'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  mobile: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', mobile: true },
  { to: '/workouts', label: 'Workouts', icon: 'dumbbell', mobile: true },
  { to: '/timer', label: 'Timer', icon: 'timer', mobile: true },
  { to: '/history', label: 'History', icon: 'history', mobile: true },
  { to: '/analytics', label: 'Analytics', icon: 'chart', mobile: true },
  { to: '/exercises', label: 'Exercises', icon: 'list', mobile: false },
  { to: '/settings', label: 'Settings', icon: 'settings', mobile: false },
];

export default function App() {
  const location = useLocation();
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="favicon-mr.svg" alt="" width={28} height={28} /> Workout Tracker
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <UpdatePrompt />
        {stravaRedirect && StravaRedirectNotice && (
          <Suspense fallback={null}>
            <StravaRedirectNotice />
          </Suspense>
        )}
        <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/exercises/new" element={<ExerciseEditPage />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/exercises/:id/edit" element={<ExerciseEditPage />} />
            <Route path="/workouts" element={<WorkoutsPage />} />
            <Route path="/workouts/:id" element={<WorkoutEditPage />} />
            <Route path="/programs" element={<Navigate to="/workouts" replace />} />
            <Route path="/programs/:id" element={<ProgramRedirect />} />
            <Route path="/workout/:id" element={<WorkoutPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:id" element={<SessionDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/activity/new" element={<ActivityFormPage />} />
            <Route path="/activity/:id" element={<ActivityFormPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="empty">Page not found.</div>} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
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

function ProgramRedirect() {
  const { id } = useParams();
  return <Navigate to={`/workouts/${id}`} replace />;
}
