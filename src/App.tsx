import './App.css';
import rocketsLogo from './assets/rockets.svg';
import { AuthGate } from './auth/AuthGate';
import { InventoryTable } from './features/inventory/InventoryTable';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { LogsPanel } from './features/logs/LogsPanel';
import { Dashboard } from './features/dashboard/Dashboard';
import { Roster } from './features/dashboard/Roster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import {
  Bell,
  Settings,
  Package,
  BarChart3,
  LogOut,
  User,
  Wifi,
  WifiOff,
  Users,
} from 'lucide-react';

type TabKey = 'dashboard' | 'inventory' | 'settings' | 'logs' | 'distribution' | 'roster';

function App() {
  const [tab, setTab] = useState<TabKey>('roster');
  const [userEmail, setUserEmail] = useState<string>('');
  const [notifications, setNotifications] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isHeaderDetached, setIsHeaderDetached] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');

      const { data: lowStockItems } = await supabase
        .from('jerseys')
        .select('*')
        .lte('qty_inventory', 1);

      setNotifications(lowStockItems?.length || 0);
    })();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleScroll = () => setIsHeaderDetached(window.scrollY > 12);

    handleScroll();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const shortEmail = useMemo(() => {
    if (!userEmail) return 'Signed in';
    return userEmail.length > 26 ? `${userEmail.slice(0, 23)}…` : userEmail;
  }, [userEmail]);

  const tabs: Array<{
    id: TabKey;
    label: string;
    icon: typeof BarChart3;
    badge?: number;
    hint?: string;
    primary?: boolean;
  }> = [
    { id: 'roster', label: 'Roster', icon: Users, hint: 'Players & styles', primary: true },
    { id: 'dashboard', label: 'Insights', icon: BarChart3, hint: 'Metrics overview' },
    { id: 'inventory', label: 'Inventory', icon: Package, hint: 'Full catalogue' },
    { id: 'settings', label: 'Settings', icon: Settings, hint: 'Team preferences' },
    { id: 'logs', label: 'Alerts', icon: Bell, badge: notifications, hint: 'Recent activity' },
  ];

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      location.reload();
    } finally {
      setIsSigningOut(false);
    }
  };

  const renderTabContent = () => {
    switch (tab) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <InventoryTable />;
      case 'settings':
        return <SettingsPanel />;
      case 'logs':
        return <LogsPanel />;
      case 'roster':
      default:
        return <Roster />;
    }
  };

  return (
    <AuthGate>
      <div className="app-shell">
        <div className="app-gradient" aria-hidden="true" />

        <header className={`app-header ${isHeaderDetached ? 'app-header--detached' : ''}`}>
          <div className="app-header__brand">
            <button
              type="button"
              className="brand-sigil"
              onClick={() => setTab('dashboard')}
              aria-label="Go to dashboard"
            >
              <img src={rocketsLogo} alt="Houston Rockets logo" loading="lazy" />
            </button>
            <div className="brand-copy">
              <p className="brand-copy__title">Houston Inventory</p>
              <p className="brand-copy__subtitle">Locker room equipment hub</p>
            </div>
            <span className="brand-badge">Updated</span>
          </div>

          <div className="app-header__meta">
            <span
              className={`status-pill ${isOnline ? 'status-pill--online' : 'status-pill--offline'}`}
            >
              {isOnline ? <Wifi className="status-pill__icon" /> : <WifiOff className="status-pill__icon" />}
              <span className="status-pill__text">{isOnline ? 'Live sync' : 'Offline mode'}</span>
            </span>

            <button
              type="button"
              className={`header-chip header-chip--ghost ${tab === 'logs' ? 'is-active' : ''}`}
              onClick={() => setTab('logs')}
              aria-label="View alerts"
            >
              <span className="header-chip__icon-wrapper">
                <Bell className="header-chip__icon" />
                {notifications > 0 && (
                  <span className="header-chip__badge" aria-hidden="true">
                    {notifications}
                  </span>
                )}
              </span>
              <span className="header-chip__label">Alerts</span>
            </button>

            <div className="header-chip header-chip--user" title={userEmail}>
              <User className="header-chip__icon" />
              <span className="header-chip__label">{shortEmail}</span>
            </div>

            <button
              type="button"
              className="header-chip header-chip--ghost"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="header-chip__icon" />
              <span className="header-chip__label">Sign out</span>
            </button>
          </div>
        </header>

        <nav className="desktop-tab-bar" aria-label="Primary navigation">
          {tabs.map(({ id, label, icon: Icon, badge, hint }) => (
            <button
              key={id}
              type="button"
              className={`desktop-tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon className="desktop-tab__icon" />
              <div className="desktop-tab__meta">
                <span className="desktop-tab__label">{label}</span>
                {hint && <span className="desktop-tab__hint">{hint}</span>}
              </div>
              {badge ? <span className="desktop-tab__badge">{badge}</span> : null}
            </button>
          ))}
        </nav>

        <main className="app-main" role="main">
          <div className="app-main__inner fade-in">
            <ErrorBoundary>{renderTabContent()}</ErrorBoundary>
          </div>
        </main>

        <nav className="mobile-tab-bar" aria-label="Mobile navigation">
          {tabs.map(({ id, label, icon: Icon, badge, primary }) => (
            <button
              key={id}
              type="button"
              className={`mobile-tab ${tab === id ? 'is-active' : ''} ${primary ? 'mobile-tab--primary' : ''}`}
              onClick={() => setTab(id)}
            >
              <div className="mobile-tab__icon-wrap">
                <Icon className="mobile-tab__icon" />
                {badge ? <span className="mobile-tab__badge">{badge}</span> : null}
              </div>
              <span className="mobile-tab__label">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </AuthGate>
  );
}

export default App;
