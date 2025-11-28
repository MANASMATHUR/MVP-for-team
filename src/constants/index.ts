/**
 * Application constants
 * Centralized location for magic numbers, strings, and configuration values
 */

/** Low stock threshold - items with quantity at or below this are considered low stock */
export const LOW_STOCK_THRESHOLD = 1;

/** Default jersey edition */
export const DEFAULT_EDITION = 'Icon' as const;

/** Default jersey size */
export const DEFAULT_SIZE = '48';

/** Maximum inventory quantity before showing warning */
export const MAX_INVENTORY_WARNING = 100;

/** Maximum LVA quantity before showing warning */
export const MAX_LVA_WARNING = 50;

/** Large change threshold - changes above this require confirmation */
export const LARGE_CHANGE_THRESHOLD = 10;

/** Toast notification duration in milliseconds */
export const TOAST_DURATION = 4000;

/** Header detachment scroll threshold in pixels */
export const HEADER_DETACH_SCROLL = 12;

/** Days of historical data to fetch for analytics */
export const ANALYTICS_HISTORY_DAYS = 90;

/** Days of recent activity to show in reports */
export const RECENT_ACTIVITY_DAYS = 30;

/** Valid jersey editions */
export const VALID_EDITIONS = ['Icon', 'Statement', 'Association', 'City'] as const;

/** Email truncation length */
export const EMAIL_TRUNCATE_LENGTH = 26;

