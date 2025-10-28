import './App.css'
import rocketsLogo from './assets/rockets.svg';
import { AuthGate } from './auth/AuthGate';
import { InventoryTable } from './features/inventory/InventoryTable';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { LogsPanel } from './features/logs/LogsPanel';
import { Dashboard } from './features/dashboard/Dashboard';
import { Roster } from './features/dashboard/Roster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { Bell, Settings, Package, BarChart3, LogOut, User, Wifi, WifiOff, Users } from 'lucide-react';

function App() {
  const [tab, setTab] = useState<'dashboard' | 'inventory' | 'settings' | 'logs' | 'distribution' | 'roster'>('roster');
  const [userEmail, setUserEmail] = useState<string>('');
  const [notifications, setNotifications] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');
      
      // Check for low stock notifications
      const { data: lowStockItems } = await supabase
        .from('jerseys')
        .select('*')
        .lte('qty_inventory', 1);
      
      setNotifications(lowStockItems?.length || 0);
    })();

    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'roster', label: 'Roster', icon: Users },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'logs', label: 'Logs', icon: Bell },
  ];

  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <img src={rocketsLogo} alt="Rockets" className="h-8 w-auto drop-shadow-sm" />
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Houston Inventory</h1>
                </div>
                <div className="hidden md:block text-sm text-gray-500">
                  Jersey Management System
                </div>
              </div>

              <nav className="flex items-center gap-1 p-1 rounded-xl bg-gray-100/60">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tab === id
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/70'
                    }`}
                    onClick={() => setTab(id as any)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {id === 'logs' && notifications > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {notifications}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {isOnline ? (
                    <div title="Online">
                      <Wifi className="h-4 w-4 text-green-500" />
                    </div>
                  ) : (
                    <div title="Offline">
                      <WifiOff className="h-4 w-4 text-red-500" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:block">{userEmail}</span>
                </div>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    location.reload();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:block">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="fade-in">
            <ErrorBoundary>
              {tab === 'dashboard' && <Dashboard />}
              {tab === 'inventory' && <InventoryTable />}
              {tab === 'roster' && <Roster />}
              {tab === 'settings' && <SettingsPanel />}
              {tab === 'logs' && <LogsPanel />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </AuthGate>
  )
}

export default App

