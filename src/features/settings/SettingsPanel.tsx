import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Settings } from '../../types';
import { notifyLowStock } from '../../integrations/make';
import { generateInventoryReport, suggestInventoryImprovements } from '../../integrations/openai';
import { Settings as SettingsIcon, Save, TestTube, Download, Lightbulb, Bell, User, Activity, Mail } from 'lucide-react';
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
  const [diag, setDiag] = useState<{ supabase: boolean; makeWebhook: boolean; openai: boolean } | null>(null);
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
      // Voiceflow integration removed
      const makeWebhookOk = !!import.meta.env.VITE_MAKE_WEBHOOK_URL;
      const openaiOk = !!import.meta.env.VITE_OPENAI_API_KEY;

      setDiag({ supabase: !!supabaseOk, makeWebhook: makeWebhookOk, openai: openaiOk });
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
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-semibold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your system configuration and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings Card */}
        <div className="lg:col-span-2">
          <div className="card p-8">
            <div className="space-y-6">
              {/* Notification Settings */}
              <div className="border-b border-gray-100 pb-6 last:border-0">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Low Stock Threshold
                    </label>
                    <p className="text-sm text-gray-500 mb-3">
                      Receive alerts when inventory falls below this quantity
                    </p>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        className="input w-32"
                        value={settings.low_stock_threshold}
                        min={0}
                        onChange={(e) => setSettings((s) => ({ ...s, low_stock_threshold: parseInt(e.target.value || '0', 10) }))}
                      />
                      <span className="text-sm text-gray-500">units</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Alert Recipient
                    </label>
                    <p className="text-sm text-gray-500 mb-3">
                      Email address to receive low stock notifications
                    </p>
                    <input
                      type="email"
                      className="input w-full"
                      placeholder="equipment@houstonrockets.com"
                      value={settings.reorder_email_recipient || ''}
                      onChange={(e) => setSettings((s) => ({ ...s, reorder_email_recipient: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Email Configuration */}
              <div className="border-b border-gray-100 pb-6 last:border-0">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Email Service</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Automatic email delivery status
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm text-gray-700">Service ID</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">
                        {import.meta.env.VITE_EMAILJS_SERVICE_ID ? 'Configured' : 'Not set'}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${
                        import.meta.env.VITE_EMAILJS_SERVICE_ID ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm text-gray-700">Template ID</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">
                        {import.meta.env.VITE_EMAILJS_TEMPLATE_ID ? 'Configured' : 'Not set'}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${
                        import.meta.env.VITE_EMAILJS_TEMPLATE_ID ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm text-gray-700">Public Key</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">
                        {import.meta.env.VITE_EMAILJS_USER_ID ? 'Configured' : 'Not set'}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${
                        import.meta.env.VITE_EMAILJS_USER_ID ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-4">
                  Configure these in your environment variables to enable automatic email alerts
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button 
                  className="btn btn-primary"
                  disabled={saving} 
                  onClick={saveSettings}
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
                <button
                  className="btn btn-outline"
                  onClick={testLowStockAlert}
                >
                  <TestTube className="h-4 w-4" />
                  Test Alert
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Actions */}
        <div className="space-y-4">
          {/* System Status */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide text-xs">
              System Status
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Supabase</span>
                <div className={`w-2 h-2 rounded-full ${diag?.supabase ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">OpenAI API</span>
                <div className={`w-2 h-2 rounded-full ${
                  import.meta.env.VITE_OPENAI_API_KEY ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Make.com</span>
                <div className={`w-2 h-2 rounded-full ${
                  import.meta.env.VITE_MAKE_WEBHOOK_URL ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
              </div>
            </div>

            <button 
              className="btn btn-sm btn-outline w-full mt-4" 
              onClick={runDiagnostics} 
              disabled={diagRunning}
            >
              <Activity className="h-4 w-4" />
              {diagRunning ? 'Running...' : 'Run Diagnostics'}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide text-xs">
              Actions
            </h3>
            
            <div className="space-y-3">
              <button
                className="btn btn-outline w-full justify-start"
                onClick={generateReport}
              >
                <Download className="h-4 w-4" />
                Download Report
              </button>
              
              <button
                className="btn btn-outline w-full justify-start"
                onClick={testLowStockAlert}
              >
                <TestTube className="h-4 w-4" />
                Test Webhook
              </button>
              
              {import.meta.env.VITE_EMAILJS_USER_ID && (
                <button
                  className="btn btn-outline w-full justify-start"
                  onClick={async () => {
                    try {
                      const { sendLowStockEmail } = await import('../../integrations/make');
                      const emailjsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
                      const emailjsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
                      const emailjsUserId = import.meta.env.VITE_EMAILJS_USER_ID;
                      
                      if (emailjsServiceId && emailjsTemplateId && emailjsUserId) {
                        const success = await sendLowStockEmail(
                          'Test: Low Stock Alert',
                          'This is a test email from Houston Rockets Inventory System.',
                          settings.reorder_email_recipient || userEmail
                        );
                        if (success) {
                          toast.success(`Test email sent to ${settings.reorder_email_recipient || userEmail}`);
                        } else {
                          toast.error('Failed to send test email');
                        }
                      }
                    } catch (e) {
                      toast.error('Test email failed');
                    }
                  }}
                >
                  <Mail className="h-4 w-4" />
                  Test Email
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


