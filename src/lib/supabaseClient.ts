import { createClient } from '@supabase/supabase-js';

/**
 * Validates that required environment variables are present
 * @throws {Error} If required environment variables are missing
 */
function validateEnvVars() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Please check your .env.local file and ensure all required variables are set. ` +
      `See .env.example for reference.`
    );
  }

  // Basic URL validation
  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid URL');
  }

  return { supabaseUrl, supabaseAnonKey };
}

const { supabaseUrl, supabaseAnonKey } = validateEnvVars();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Safely gets the current authenticated user without throwing AuthSessionMissingError.
 * First checks for a valid session, then fetches user data.
 * @returns The user object if authenticated, null otherwise
 */
export async function getCurrentUser() {
  try {
    // First check if there's a valid session - this doesn't throw errors
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      // No session exists, return null without throwing
      return null;
    }

    // Session exists, now safely get the user
    const { data: userData, error } = await supabase.auth.getUser();

    if (error) {
      console.warn('Error fetching user:', error.message);
      return null;
    }

    return userData.user;
  } catch (error) {
    console.warn('Unexpected error in getCurrentUser:', error);
    return null;
  }
}

/**
 * Safely gets the current user's email without throwing errors.
 * @returns The user's email if authenticated, null otherwise
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.email ?? null;
}


