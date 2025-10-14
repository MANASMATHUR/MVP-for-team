export type JerseyEdition = 'Icon' | 'Statement' | 'Association' | 'City';

export interface JerseyItem {
  id: string;
  player_name: string;
  edition: JerseyEdition;
  size: string; // number-based as string e.g., '46', '48'
  qty_inventory: number;
  qty_due_lva: number;
  updated_at: string; // ISO string
  updated_by?: string | null;
}

export interface Settings {
  low_stock_threshold: number; // default 1
}


