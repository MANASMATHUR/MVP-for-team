import { useState, useEffect, useCallback } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { useErrorHandler } from './useErrorHandler';

interface UseSupabaseQueryOptions<T> {
  /** Query function that returns a Supabase query builder */
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>;
  /** Whether to automatically fetch on mount */
  enabled?: boolean;
  /** Error context for better error messages */
  errorContext?: string;
}

interface UseSupabaseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: PostgrestError | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for Supabase queries with built-in error handling and loading states
 * 
 * @example
 * import { supabase } from '../lib/supabaseClient';
 * const { data, loading, error, refetch } = useSupabaseQuery({
 *   queryFn: () => supabase.from('jerseys').select('*'),
 *   errorContext: 'Failed to load jerseys'
 * });
 */
export function useSupabaseQuery<T>({
  queryFn,
  enabled = true,
  errorContext = 'Failed to fetch data',
}: UseSupabaseQueryOptions<T>): UseSupabaseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<PostgrestError | null>(null);
  const { handleError } = useErrorHandler();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: result, error: queryError } = await queryFn();
      
      if (queryError) {
        setError(queryError);
        handleError(queryError, errorContext);
        setData(null);
      } else {
        setData(result);
        setError(null);
      }
    } catch (err) {
      const unexpectedError = err as Error;
      handleError(unexpectedError, errorContext);
      setError({ message: unexpectedError.message } as PostgrestError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryFn, errorContext, handleError]);

  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

