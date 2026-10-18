import { Suspense, useLayoutEffect } from 'react';
import { lazyPage as lazy } from './lib/lazyPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Icon, type IconName } from './components/Icon';
import { noteRoute } from './hooks/useStickyState';
import { UpdatePrompt } from './components/UpdatePrompt';
import TodayPage from './pages/TodayPage';
import { BrandLoader } from './components/BrandRing';
import { isStravaRedirect, StravaRedirectNotice } from './strava';

const stravaRedirect = isStravaRedirect();

const ExercisesPage = lazy(() => import('./pages/ExercisesPage'));
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage'));
const ExerciseEditPage = lazy(() => import('./pages/ExerciseEditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage'));
const WorkoutEditPage = lazy(() => import('./pages/WorkoutEditPage'));
const WorkoutTemplatesPage = lazy(() => import('./pages/WorkoutTemplatesPage'));
const ExerciseTemplatesPage = lazy(() => import('./pages/ExerciseTemplatesPage'));
const ExerciseTemplateEditPage = lazy(() => import('./pages/ExerciseTemplateEditPage'));
const TimerTemplatesPage = lazy(() => import('./pages/TimerTemplatesPage'));
const TimerTemplateEditPage = lazy(() => import('./pages/TimerTemplateEditPage'));
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
  { to: '/settings', label: 'Settings', icon: 'settings', mobile: false },
];

/** The exercise catalogue lives inside Workouts, so it lights up the Workouts tab too. */
function navActive(to: string, path: string): boolean {
  if (to === '/') return path === '/';
  if (to === '/workouts') return path.startsWith('/workouts') || path.startsWith('/exercises');
  return path === to || path.startsWith(`${to}/`);
}

export default function App() {
  const location = useLocation();
  // A new page opens from the top (lists then restore their own position, see useScrollMemory).
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    noteRoute(location.pathname);
  }, [location.pathname]);
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="favicon-mr.svg" alt="" width={28} height={28} /> Workout Tracker
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={() => (navActive(n.to, location.pathname) ? 'active' : '')}>
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
        <Suspense fallback={<BrandLoader />}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/exercises/new" element={<ExerciseEditPage />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/exercises/:id/edit" element={<ExerciseEditPage />} />
            <Route path="/workouts" element={<WorkoutsPage />} />
            <Route path="/workouts/templates" element={<WorkoutTemplatesPage />} />
            <Route path="/workouts/blocks" element={<ExerciseTemplatesPage />} />
            <Route path="/workouts/blocks/:id" element={<ExerciseTemplateEditPage />} />
            <Route path="/workouts/timers" element={<TimerTemplatesPage />} />
            <Route path="/workouts/timers/:id" element={<TimerTemplateEditPage />} />
            <Route path="/workouts/exercise-templates" element={<Navigate to="/workouts/blocks" replace />} />
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
          <NavLink key={n.to} to={n.to} className={() => (navActive(n.to, location.pathname) ? 'active' : '')}>
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
