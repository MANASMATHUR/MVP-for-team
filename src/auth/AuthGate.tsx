import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined)?.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) || [];

  if (!supabaseUrl || !supabaseAnon) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-lg rounded-xl border p-6">
          <h1 className="text-xl font-semibold mb-2">Environment not configured</h1>
          <p className="text-sm text-gray-600">Add the following to <code>.env.local</code> and restart:</p>
          <pre className="mt-3 rounded bg-gray-50 p-3 text-xs overflow-auto">{`VITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...`}</pre>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };
    getSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading...</div>;
  }
  if (!session) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-blue-50 to-rose-50">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded bg-red-600" />
            <h1 className="text-xl font-semibold tracking-tight">Houston Inventory</h1>
          </div>
          <p className="text-sm text-gray-600 mb-4">Sign in with your email to continue.</p>
          <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
          {allowedEmails.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">Access limited to: {allowedEmails.join(', ')}</p>
          )}
        </div>
      </div>
    );
  }
  const email = session.user?.email?.toLowerCase() || '';
  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-md rounded-xl border p-6 shadow-sm bg-white">
          <h1 className="text-xl font-semibold mb-2">Access restricted</h1>
          <p className="text-sm text-gray-600">Your account ({email}) is not authorized for this MVP. Contact the admin to be added.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}


