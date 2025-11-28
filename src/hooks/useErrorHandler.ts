import { useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * Custom hook for consistent error handling across the application
 * Provides standardized error handling with user-friendly messages
 */
export function useErrorHandler() {
  const handleError = useCallback((error: unknown, context?: string) => {
    let errorMessage = 'An unexpected error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;
    
    console.error(fullMessage, error);
    toast.error(fullMessage);
    
    return errorMessage;
  }, []);

  const handleAsyncError = useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      context?: string,
      fallback?: T
    ): Promise<T | undefined> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error, context);
        return fallback;
      }
    },
    [handleError]
  );

  return { handleError, handleAsyncError };
}

