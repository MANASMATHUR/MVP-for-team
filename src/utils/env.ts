/**
 * Environment variable utilities
 * Provides type-safe access and validation for environment variables
 */

/**
 * Gets an environment variable with optional validation
 * @param key - The environment variable key (without VITE_ prefix)
 * @param required - Whether the variable is required (default: false)
 * @param validator - Optional validation function
 * @returns The environment variable value or undefined
 * @throws {Error} If required variable is missing or validation fails
 */
export function getEnvVar(
  key: string,
  required = false,
  validator?: (value: string) => boolean
): string | undefined {
  const fullKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
  const value = import.meta.env[fullKey] as string | undefined;

  if (required && !value) {
    throw new Error(
      `Required environment variable ${fullKey} is missing. ` +
      `Please check your .env.local file. See .env.example for reference.`
    );
  }

  if (value && validator && !validator(value)) {
    throw new Error(`Environment variable ${fullKey} failed validation`);
  }

  return value;
}

/**
 * Validates that a string is a valid URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets a required environment variable
 * @throws {Error} If the variable is missing
 */
export function requireEnvVar(key: string): string {
  const value = getEnvVar(key, true);
  if (!value) {
    throw new Error(`Required environment variable VITE_${key} is missing`);
  }
  return value;
}

/**
 * Gets an optional environment variable with a default value
 */
export function getEnvVarWithDefault(key: string, defaultValue: string): string {
  return getEnvVar(key) ?? defaultValue;
}

