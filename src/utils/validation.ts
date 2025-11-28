import { VALID_EDITIONS, MAX_INVENTORY_WARNING, MAX_LVA_WARNING } from '../constants';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates jersey data for completeness and correctness
 * @param data - The jersey data to validate
 * @returns Validation result with errors and warnings
 */
export function validateJerseyData(data: {
  player_name: string;
  edition: string;
  size: string;
  qty_inventory: number;
  qty_due_lva: number;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field validation
  if (!data.player_name?.trim()) {
    errors.push('Player name is required');
  }

  if (!data.edition?.trim()) {
    errors.push('Edition is required');
  }

  if (!data.size?.trim()) {
    errors.push('Size is required');
  }

  // Data type validation
  if (typeof data.qty_inventory !== 'number' || isNaN(data.qty_inventory)) {
    errors.push('Inventory quantity must be a valid number');
  }

  if (typeof data.qty_due_lva !== 'number' || isNaN(data.qty_due_lva)) {
    errors.push('LVA quantity must be a valid number');
  }

  // Range validation
  if (data.qty_inventory < 0) {
    errors.push('Inventory quantity cannot be negative');
  }

  if (data.qty_due_lva < 0) {
    errors.push('LVA quantity cannot be negative');
  }

  // Warning for high quantities
  if (data.qty_inventory > MAX_INVENTORY_WARNING) {
    warnings.push(`Inventory quantity seems unusually high (>${MAX_INVENTORY_WARNING})`);
  }

  if (data.qty_due_lva > MAX_LVA_WARNING) {
    warnings.push(`LVA quantity seems unusually high (>${MAX_LVA_WARNING})`);
  }

  // Edition validation
  if (data.edition && !VALID_EDITIONS.includes(data.edition as typeof VALID_EDITIONS[number])) {
    errors.push(`Edition must be one of: ${VALID_EDITIONS.join(', ')}`);
  }

  // Size validation (basic)
  if (data.size && !/^\d+$/.test(data.size)) {
    warnings.push('Size should typically be a number (e.g., 48, 50)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateQuantityChange(
  currentValue: number,
  newValue: number,
  fieldName: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (newValue < 0) {
    errors.push(`${fieldName} cannot be negative`);
  }

  if (newValue > 1000) {
    warnings.push(`${fieldName} seems unusually high (>1000)`);
  }

  const change = newValue - currentValue;
  if (Math.abs(change) > 100) {
    warnings.push(`Large change detected: ${change > 0 ? '+' : ''}${change} ${fieldName}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function confirmDestructiveAction(action: string): Promise<boolean> {
  return new Promise((resolve) => {
    const confirmed = window.confirm(
      `⚠️ WARNING: ${action}\n\nThis action cannot be undone. Are you sure you want to continue?`
    );
    resolve(confirmed);
  });
}

export function confirmLargeChange(
  fieldName: string,
  currentValue: number,
  newValue: number
): Promise<boolean> {
  const change = newValue - currentValue;
  const changePercent = Math.abs(change / currentValue) * 100;
  
  if (changePercent > 50 || Math.abs(change) > 20) {
    return new Promise((resolve) => {
      const confirmed = window.confirm(
        `⚠️ Large change detected:\n\n${fieldName}: ${currentValue} → ${newValue} (${change > 0 ? '+' : ''}${change})\n\nThis is a ${changePercent.toFixed(0)}% change. Continue?`
      );
      resolve(confirmed);
    });
  }
  
  return Promise.resolve(true);
}
