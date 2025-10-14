import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Settings } from '../../types';
import { notifyLowStock } from '../../integrations/make';
import { generateInventoryReport, suggestInventoryImprovements } from '../../integrations/openai';
import { Settings as SettingsIcon, Save, TestTube, Download, Lightbulb, Bell, User, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

interface UserPreferences {
  notification_preferences: {
    email: boolean;
    browser: boolean;
    low_stock_threshold: number;
  };
  dashboard_settings: {
    default_view: string;
    items_per_page: number;
  };
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>({ low_stock_threshold: 1 });
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    notification_preferences: {
      email: true,
      browser: true,
      low_stock_threshold: 1,
    },
    dashboard_settings: {
      default_view: 'dashboard',
      items_per_page: 25,
    },
  });
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [improvements, setImprovements] = useState<string[]>([]);
  const [diag, setDiag] = useState<{ supabase: boolean; voiceflowServerEnv: boolean; makeWebhook: boolean; openai: boolean; dryRunCall?: string } | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

  useEffect(() => {
    loadSettings();
    loadUserPreferences();
    loadImprovements();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase.from('settings').select('*').single();
      if (data) setSettings(data as Settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadUserPreferences = async () => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const email = userRes.user?.email || '';
      setUserEmail(email);

      const { data: preferences } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_email', email)
        .single();

      if (preferences) {
        setUserPreferences(preferences);
      }
    } catch (error) {
      console.error('Failed to load user preferences:', error);
    }
  };

  const loadImprovements = async () => {
    try {
      const suggestions = await suggestInventoryImprovements();
      setImprovements(suggestions);
    } catch (error) {
      console.error('Failed to load improvements:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
    await supabase.from('settings').upsert({ id: 1, ...settings });
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Save settings error:', error);
    } finally {
      setSaving(false);
    }
  };

  const saveUserPreferences = async () => {
    setSaving(true);
    try {
      await supabase.from('user_preferences').upsert({
        user_email: userEmail,
        ...userPreferences,
        updated_at: new Date().toISOString(),
      });
      toast.success('Preferences saved successfully');
    } catch (error) {
      toast.error('Failed to save preferences');
      console.error('Save preferences error:', error);
    } finally {
    setSaving(false);
    }
  };

  const testLowStockAlert = async () => {
    try {
            await notifyLowStock({
              id: 'test',
              player_name: 'Test Player',
              edition: 'Icon',
              size: '48',
              qty_inventory: settings.low_stock_threshold,
            });
      toast.success('Test low-stock alert sent successfully');
    } catch (error) {
      toast.error('Failed to send test alert');
      console.error('Test alert error:', error);
    }
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const supabaseOk = !!(await supabase.from('settings').select('id').limit(1)).data;
      const voiceflowServerEnv = !!(import.meta.env.VITE_VOICEFLOW_API_URL) || true; // server vars not readable here
      const makeWebhookOk = !!import.meta.env.VITE_MAKE_WEBHOOK_URL;
      const openaiOk = !!import.meta.env.VITE_OPENAI_API_KEY;

      // Do a dry-run start-call which should return ok without hitting provider
      let dryRunId = '';
      try {
        const res = await fetch('/api/start-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_log_id: 'healthcheck', order_details: { test: true }, dry_run: true })
        });
        const json = await res.json();
        dryRunId = json?.session_id || '';
      } catch {}

      setDiag({ supabase: !!supabaseOk, voiceflowServerEnv, makeWebhook: makeWebhookOk, openai: openaiOk, dryRunCall: dryRunId });
      toast.success('Diagnostics completed');
    } catch (e) {
      toast.error('Diagnostics failed');
    } finally {
      setDiagRunning(false);
    }
  };

  const generateReport = async () => {
    try {
      toast.loading('Generating report...', { id: 'report' });
      const report = await generateInventoryReport();
      
      // Create and download the report
      const content = report && report.length > 0 ? report : 'No report content generated.';
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Report generated and downloaded', { id: 'report' });
    } catch (error) {
      const message = (error as any)?.message || 'Failed to generate report';
      toast.error(message, { id: 'report' });
      console.error('Report generation error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings & Preferences</h1>
          <p className="text-gray-600">Configure system settings and user preferences</p>
        </div>
        <SettingsIcon className="h-8 w-8 text-gray-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Settings */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            System Settings
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Low Stock Threshold</label>
                <p className="text-xs text-gray-500">Alert when inventory falls below this number</p>
              </div>
              <input
                type="number"
                className="input w-24"
                value={settings.low_stock_threshold}
                min={0}
                onChange={(e) => setSettings((s) => ({ ...s, low_stock_threshold: parseInt(e.target.value || '0', 10) }))}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <button 
                className="btn btn-primary btn-sm" 
                disabled={saving} 
                onClick={saveSettings}
              >
                <Save className="h-4 w-4" />
                Save Settings
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={testLowStockAlert}
              >
                <TestTube className="h-4 w-4" />
                Test Alert
              </button>
            </div>
          </div>
        </div>

        {/* User Preferences */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            User Preferences
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email Notifications</label>
              <div className="mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userPreferences.notification_preferences.email}
                    onChange={(e) => setUserPreferences(prev => ({
                      ...prev,
                      notification_preferences: {
                        ...prev.notification_preferences,
                        email: e.target.checked,
                      }
                    }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Receive email notifications</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Browser Notifications</label>
              <div className="mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userPreferences.notification_preferences.browser}
                    onChange={(e) => setUserPreferences(prev => ({
                      ...prev,
                      notification_preferences: {
                        ...prev.notification_preferences,
                        browser: e.target.checked,
                      }
                    }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Show browser notifications</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Items Per Page</label>
              <select
                className="input w-32 mt-1"
                value={userPreferences.dashboard_settings.items_per_page}
                onChange={(e) => setUserPreferences(prev => ({
                  ...prev,
                  dashboard_settings: {
                    ...prev.dashboard_settings,
                    items_per_page: parseInt(e.target.value),
                  }
                }))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <button 
                className="btn btn-primary btn-sm" 
                disabled={saving} 
                onClick={saveUserPreferences}
              >
                <Save className="h-4 w-4" />
                Save Preferences
              </button>
            </div>
          </div>
        </div>

        {/* Reports & Analytics */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Download className="h-5 w-5" />
            Reports & Analytics
          </h3>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate comprehensive inventory reports with AI-powered insights and recommendations.
            </p>
            
            <button
              className="btn btn-primary btn-sm w-full"
              onClick={generateReport}
            >
              <Download className="h-4 w-4" />
              Generate Inventory Report
        </button>
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            AI-Powered Suggestions
          </h3>
          
          <div className="space-y-3">
            {improvements.length > 0 ? (
              <ul className="space-y-2">
                {improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>{improvement}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Loading suggestions...</p>
            )}
          </div>
        </div>
      </div>

      {/* Integration Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Integration Status
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Make.com Webhook</p>
              <p className="text-xs text-gray-500">Low stock notifications</p>
            </div>
            <div className={`w-3 h-3 rounded-full ${
              import.meta.env.VITE_MAKE_WEBHOOK_URL ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">OpenAI API</p>
              <p className="text-xs text-gray-500">AI-powered features</p>
            </div>
            <div className={`w-3 h-3 rounded-full ${
              import.meta.env.VITE_OPENAI_API_KEY ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Voiceflow API</p>
              <p className="text-xs text-gray-500">Voice commands & calls</p>
            </div>
            <div className={`w-3 h-3 rounded-full ${
              import.meta.env.VITE_VOICEFLOW_API_URL ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-900 text-sm">
          For outbound calling on Vercel, set server env vars in the Vercel project:
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <code className="bg-white px-2 py-1 rounded border border-gray-200">VOICEFLOW_CALL_API_URL</code>
            <code className="bg-white px-2 py-1 rounded border border-gray-200">VOICEFLOW_CALL_API_KEY</code>
            <code className="bg-white px-2 py-1 rounded border border-gray-200">SUPABASE_URL</code>
            <code className="bg-white px-2 py-1 rounded border border-gray-200">SUPABASE_ANON_KEY</code>
          </div>
          <div className="mt-2 text-xs text-yellow-800">Optional (browser-side NLP): VITE_VOICEFLOW_API_URL, VITE_VOICEFLOW_API_KEY</div>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Diagnostics
          </h4>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={runDiagnostics} disabled={diagRunning}>
              {diagRunning ? 'Running…' : 'Run Diagnostics'}
            </button>
            {diag && (
              <div className="text-sm text-gray-700">
                <span className={`px-2 py-0.5 rounded ${diag.supabase ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>Supabase</span>
                <span className={`ml-2 px-2 py-0.5 rounded ${diag.makeWebhook ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>Make</span>
                <span className={`ml-2 px-2 py-0.5 rounded ${diag.openai ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>OpenAI</span>
                <span className={`ml-2 px-2 py-0.5 rounded ${diag.voiceflowServerEnv ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>Calling Env</span>
                {diag.dryRunCall && <span className="ml-2 text-xs text-gray-500">dry_run: {diag.dryRunCall}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


