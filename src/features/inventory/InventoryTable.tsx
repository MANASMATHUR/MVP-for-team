import { useEffect, useMemo, useState, startTransition } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { JerseyItem, JerseyEdition } from '../../types';
import { Adjuster } from '../../components/Adjuster';
import { notifyLowStock } from '../../integrations/make';
import { buildReorderEmailDraft, buildReorderEmailDraftAI, optimizeOrderQuantity } from '../../integrations/openai';
import { copyEmailToClipboard, openEmailClient } from '../../utils/emailUtils';
import { sendLowStockEmail } from '../../integrations/make';
import { validateJerseyData, confirmLargeChange } from '../../utils/validation';
import { VoiceMic } from './VoiceMic';
import { Search, Plus, Phone, Download, AlertTriangle, CheckCircle, Clock, Package, Upload, Send, Keyboard, Copy, Mail, ChevronDown, Shield, AlertTriangle as Warning } from 'lucide-react';
import { QuickActions } from '../../components/QuickActions';
import { SimplePad } from '../../components/SimplePad';
import toast from 'react-hot-toast';

type Row = JerseyItem;

const EDITIONS: JerseyEdition[] = ['Icon', 'Statement', 'Association', 'City'];

function ReorderEmailButton({ filtered }: { filtered: Row[] }) {
  const [emailData, setEmailData] = useState<{ subject: string; body: string; recipient: string; itemCount: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateEmailData = async () => {
    if (emailData) return emailData;
    
    setIsGenerating(true);
    try {
      const { data: settings } = await supabase.from('settings').select('low_stock_threshold, reorder_email_recipient').single();
      const threshold = settings?.low_stock_threshold ?? 1;
      const recipient = settings?.reorder_email_recipient;
      const lowStock = filtered.filter(r => r.qty_inventory <= threshold);
      
      if (lowStock.length === 0) {
        toast.success('No low stock items to reorder');
        return null;
      }

      if (!recipient) {
        toast.error('Please configure reorder email recipient in Settings');
        return null;
      }

      // Build a concise, professional email body listing low-stock items
      const plainBlocks = lowStock.map(item => buildReorderEmailDraft({
        player_name: item.player_name,
        edition: item.edition,
        size: item.size,
        qty_needed: Math.max(1, (threshold - item.qty_inventory) || 1)
      })).join('\n\n---\n\n');

      // Polish into one cohesive reorder email thread
      const aiPolished = await buildReorderEmailDraftAI(plainBlocks);

      const subjectMatch = aiPolished.match(/^Subject:\s*(.*)$/m);
      const subject = subjectMatch ? subjectMatch[1] : `Jersey Reorder Request - ${new Date().toLocaleDateString()}`;

      const body = aiPolished.replace(/^Subject:.*\n?/, '');
      
      const data = { subject, body, recipient, itemCount: lowStock.length };
      setEmailData(data);
      return data;
    } catch (e) {
      console.error('Generate reorder email error:', e);
      toast.error('Failed to generate reorder email');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDropdownClick = async () => {
    const data = await generateEmailData();
    if (!data) return;
  };

  const handleCopy = async () => {
    const data = await generateEmailData();
    if (!data) return;
    
    const success = await copyEmailToClipboard(data.subject, data.body, data.recipient);
    if (success) {
      toast.success(`Reorder email copied to clipboard (${data.itemCount} item${data.itemCount === 1 ? '' : 's'})`);
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleOpenInOutlook = async () => {
    const data = await generateEmailData();
    if (!data) return;
    
    openEmailClient(data.recipient, data.subject, data.body);
    toast.success(`Reorder email opened in email app (${data.itemCount} item${data.itemCount === 1 ? '' : 's'})`);
  };

  if (isGenerating) {
    return (
      <button className="btn btn-primary btn-sm" disabled>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        Generating...
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleDropdownClick}
        className="btn btn-primary btn-sm flex items-center gap-2"
        title="Reorder email options"
      >
        <Mail className="h-4 w-4" />
        Reorder Email
        <ChevronDown className="h-4 w-4" />
      </button>

      {emailData && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setEmailData(null)}
          />
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border z-20">
            <div className="py-1">
              <button
                onClick={handleCopy}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy to Clipboard
              </button>
              <button
                onClick={handleOpenInOutlook}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Open Email App
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function InventoryTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [edition, setEdition] = useState<string>('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showZeroStockOnly, setShowZeroStockOnly] = useState(false);
  const [showLVAOnly, setShowLVAOnly] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [sortBy, setSortBy] = useState<'player' | 'edition' | 'size' | 'inventory' | 'lva' | 'updated'>('player');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<{ player_name: string; edition: JerseyEdition; size: string; qty_inventory: number; qty_due_lva: number }>(
    { player_name: '', edition: 'Icon', size: '48', qty_inventory: 0, qty_due_lva: 0 }
  );
  const [adding, setAdding] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('simpleMode');
      if (saved != null) return saved === '1';
      return window.innerWidth < 768; // default to simple on mobile
    }
    return true;
  });
  // Session-level defaults: remember last used size per (player, edition)
  const [lastSizeDefaults, setLastSizeDefaults] = useState<Record<string, string>>({});


  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('jerseys')
        .select('*')
        .order('player_name');
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    };
    load();
  }, []);

  // Keyboard shortcuts for power users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N: Add new jersey
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
      }
      // Ctrl/Cmd + E: Export data
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportData();
      }
      // Ctrl/Cmd + F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
      }
      // Escape: Close modal
      if (e.key === 'Escape') {
        setShowAddModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    let filteredRows = rows.filter((r) => {
      const matchesSearch = search
        ? r.player_name.toLowerCase().includes(search.toLowerCase()) || 
          r.edition.toLowerCase().includes(search.toLowerCase()) ||
          r.size.includes(search)
        : true;
      const matchesEdition = edition ? r.edition === edition : true;
      const matchesPlayer = selectedPlayer ? r.player_name === selectedPlayer : true;
      const matchesLowStock = showLowStockOnly ? r.qty_inventory <= 1 : true;
      const matchesZeroStock = showZeroStockOnly ? r.qty_inventory === 0 : true;
      const matchesLVA = showLVAOnly ? r.qty_due_lva > 0 : true;
      
      return matchesSearch && matchesEdition && matchesPlayer && matchesLowStock && matchesZeroStock && matchesLVA;
    });

    // Enhanced sorting
    filteredRows.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'player':
          aValue = a.player_name.toLowerCase();
          bValue = b.player_name.toLowerCase();
          break;
        case 'edition':
          aValue = a.edition.toLowerCase();
          bValue = b.edition.toLowerCase();
          break;
        case 'size':
          aValue = parseInt(a.size) || 0;
          bValue = parseInt(b.size) || 0;
          break;
        case 'inventory':
          aValue = a.qty_inventory;
          bValue = b.qty_inventory;
          break;
        case 'lva':
          aValue = a.qty_due_lva;
          bValue = b.qty_due_lva;
          break;
        case 'updated':
          aValue = new Date(a.updated_at).getTime();
          bValue = new Date(b.updated_at).getTime();
          break;
        default:
          aValue = a.player_name.toLowerCase();
          bValue = b.player_name.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filteredRows;
  }, [rows, search, edition, selectedPlayer, showLowStockOnly, showZeroStockOnly, showLVAOnly, sortBy, sortOrder]);

  // Prevent layout shift flicker on modal open by locking body scroll
  useEffect(() => {
    const lockScroll = (e: any) => {
      if (document.body.classList.contains('modal-open')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', lockScroll, { passive: false } as any);
    return () => document.removeEventListener('touchmove', lockScroll as any);
  }, []);

  const turnInOne = async (row: Row) => {
    const newInventory = Math.max(0, row.qty_inventory - 1);
    const newDueLva = row.qty_due_lva + 1; // treat as at-laundry count
    await updateField(row, { qty_inventory: newInventory, qty_due_lva: newDueLva });
  };

  const updateField = async (
    row: Row,
    fields: Partial<Row>,
    options?: { successMessage?: string; silent?: boolean }
  ) => {
    // Validate the updated data
    const updatedData = { ...row, ...fields };
    const validation = validateJerseyData(updatedData);
    
    if (!validation.isValid) {
      toast.error(`Validation failed: ${validation.errors.join(', ')}`);
      return;
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        toast(warning, { icon: '⚠️', duration: 3000 });
      });
    }

    // Check for large changes and confirm if needed
    let shouldProceed = true;
    if (fields.qty_inventory !== undefined) {
      shouldProceed = await confirmLargeChange('Inventory', row.qty_inventory, fields.qty_inventory);
    }
    if (shouldProceed && fields.qty_due_lva !== undefined) {
      shouldProceed = await confirmLargeChange('LVA Due', row.qty_due_lva, fields.qty_due_lva);
    }

    if (!shouldProceed) {
      toast('Update cancelled by user');
      return;
    }

    // Clamp numeric fields to safe values before optimistic update
    const safeFields: Partial<Row> = { ...fields };
    if (typeof safeFields.qty_inventory === 'number') {
      safeFields.qty_inventory = Math.max(0, Math.floor(safeFields.qty_inventory));
    }
    if (typeof safeFields.qty_due_lva === 'number') {
      safeFields.qty_due_lva = Math.max(0, Math.floor(safeFields.qty_due_lva));
    }

    const updated = { ...row, ...safeFields } as Row;
    setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    const { data: userRes } = await supabase.auth.getUser();
    const updatedBy = userRes.user?.email ?? null;
    const { error } = await supabase
      .from('jerseys')
      .update({ ...safeFields, updated_at: new Date().toISOString(), updated_by: updatedBy })
      .eq('id', row.id);
    if (error) {
      // revert on failure
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      toast.error('Failed to update inventory item');
    } else {
      if (!options?.silent) {
        toast.success(options?.successMessage ?? 'Inventory updated successfully');
      }
    }

    // Low stock notify (client-side MVP)
    try {
      const { data: settings } = await supabase.from('settings').select('low_stock_threshold, reorder_email_recipient').single();
      const threshold = settings?.low_stock_threshold ?? 1;
      const recipient = settings?.reorder_email_recipient;
      const effectiveQty = 'qty_inventory' in safeFields ? (safeFields.qty_inventory as number) : row.qty_inventory;
      if (effectiveQty <= threshold) {
        const fallback = buildReorderEmailDraft({
          player_name: updated.player_name,
          edition: updated.edition,
          size: updated.size,
          qty_needed: Math.max(1, (threshold - effectiveQty) || 1)
        });
        const draft = await buildReorderEmailDraftAI(fallback);
        
        // Send email automatically if recipient is configured
        if (recipient) {
          const subjectMatch = draft.match(/^Subject:\s*(.*)$/m);
          const subject = subjectMatch ? subjectMatch[1] : `Jersey Reorder Request - ${updated.player_name} ${updated.edition} ${updated.size}`;
          const body = draft.replace(/^Subject:.*\n?/, '');
          
          const emailSent = await sendLowStockEmail(subject, body, recipient);
          if (emailSent) {
            toast.success(`Low stock alert sent to ${recipient}`);
          } else {
            // Don't show error - EmailJS not configured is expected during setup
            console.log('EmailJS not configured - email not sent automatically');
          }
        }
        
        await notifyLowStock({
          id: row.id,
          player_name: updated.player_name,
          edition: updated.edition,
          size: updated.size,
          qty_inventory: effectiveQty,
          reorder_email_draft: draft,
        });
        await supabase.from('activity_logs').insert({
          actor: updatedBy,
          action: 'low_stock_alert',
          details: { id: row.id, player_name: updated.player_name, edition: updated.edition, size: updated.size, qty_inventory: effectiveQty }
        });
      }
    } catch {}

    // Write generic update log
    try {
      await supabase.from('activity_logs').insert({
        actor: updatedBy,
        action: 'inventory_update',
        details: { id: row.id, fields }
      });
    } catch {}
  };

  const openAddModal = () => {
    setNewItem({ player_name: '', edition: 'Icon', size: '48', qty_inventory: 0, qty_due_lva: 0 });
    setShowAddModal(true);
  };

  const submitNewItem = async () => {
    // Use our validation system
    const validation = validateJerseyData(newItem);
    
    if (!validation.isValid) {
      toast.error(`Validation failed: ${validation.errors.join(', ')}`);
      return;
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        toast(warning, { icon: '⚠️', duration: 3000 });
      });
    }
    setAdding(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const updatedBy = userRes.user?.email ?? null;
      const { data, error } = await supabase
        .from('jerseys')
        .insert({
          player_name: newItem.player_name.trim(),
          edition: newItem.edition,
          size: newItem.size.trim(),
          qty_inventory: Math.max(0, Number(newItem.qty_inventory) || 0),
          qty_due_lva: Math.max(0, Number(newItem.qty_due_lva) || 0),
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      setRows((prev) => [data as Row, ...prev]);
      setShowAddModal(false);
      toast.success('Jersey added');
      try {
        await supabase.from('activity_logs').insert({
          actor: updatedBy,
          action: 'inventory_update',
          details: { id: (data as any)?.id, created: true }
        });
      } catch {}
    } catch (e: any) {
      const message = e?.message || 'Failed to add jersey';
      toast.error(message);
      console.error('Add jersey error:', e);
    } finally {
      setAdding(false);
    }
  };

  const handleOrderCall = async (_row: Row) => {
    // Order calling functionality removed - voiceflow integration no longer used
    toast.error('Order calling feature has been removed. Use voice commands or manual reorder emails instead.', { id: 'order-call' });
  };

  const handleOptimizeOrder = async (row: Row) => {
    try {
      toast.loading('Analyzing optimal order quantity...', { id: 'optimize-order' });
      const optimization = await optimizeOrderQuantity(row.player_name, row.edition, row.size, row.qty_inventory);
      toast.success(`Recommended quantity: ${optimization.suggestedQuantity} ($${optimization.costEstimate})`, { id: 'optimize-order' });
    } catch (error) {
      toast.error('Failed to optimize order', { id: 'optimize-order' });
      console.error('Optimization error:', error);
    }
  };

  const exportData = () => {
    // Yield to next paint to avoid blocking INP on large datasets
    toast.loading('Exporting inventory...', { id: 'export' });
    setTimeout(() => {
      const csvContent = [
        ['Player', 'Edition', 'Size', 'Inventory', 'Due to LVA', 'Last Updated', 'Updated By'],
        ...filtered.map(row => [
          row.player_name,
          row.edition,
          row.size,
          row.qty_inventory,
          row.qty_due_lva,
          new Date(row.updated_at).toLocaleDateString(),
          row.updated_by || ''
        ])
      ].map(row => row.join(',')).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Inventory data exported', { id: 'export' });
    }, 0);
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean);
    const [header, ...lines] = rows;
    const cols = header.split(',').map((h) => h.trim().toLowerCase());
    const required = ['player', 'edition', 'size', 'inventory', 'due to lva'];
    const ok = required.every((r) => cols.includes(r));
    if (!ok) {
      toast.error('CSV must include: Player, Edition, Size, Inventory, Due to LVA');
      return;
    }
    let imported = 0;
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < cols.length) continue;
      const get = (name: string) => parts[cols.indexOf(name)].trim();
      const player_name = get('player');
      const edition = get('edition') as JerseyEdition;
      const size = get('size');
      const qty_inventory = Number(get('inventory')) || 0;
      const qty_due_lva = Number(get('due to lva')) || 0;
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const updatedBy = userRes.user?.email ?? null;
        const { data, error } = await supabase
          .from('jerseys')
          .insert({ player_name, edition, size, qty_inventory, qty_due_lva, updated_by: updatedBy, updated_at: new Date().toISOString() })
          .select()
          .single();
        if (!error && data) {
          setRows((prev) => [data as Row, ...prev]);
          imported += 1;
        }
      } catch {}
    }
    toast.success(`Imported ${imported} item(s)`);
  };

  const sendToLeague = async (row: Row) => {
    const qtyStr = window.prompt(`Send how many of ${row.player_name} ${row.edition} size ${row.size} to LVA?`, '1');
    if (!qtyStr) return;
    const qty = Math.max(0, Math.min(row.qty_inventory, Number(qtyStr) || 0));
    if (qty <= 0) return;
    await updateField(row, { qty_inventory: row.qty_inventory - qty, qty_due_lva: row.qty_due_lva + qty });
  };

  const handleMobileAction = async (row: Row, action: 'give' | 'laundry' | 'receive') => {
    if (action === 'give') {
      if (row.qty_inventory <= 0) {
        toast.error('No jerseys on hand to give away.');
        return;
      }
      await updateField(
        row,
        { qty_inventory: Math.max(0, row.qty_inventory - 1) },
        { successMessage: 'Recorded giveaway of 1 jersey' }
      );
      return;
    }

    if (action === 'laundry') {
      if (row.qty_inventory <= 0) {
        toast.error('Nothing available to send to laundry.');
        return;
      }
      await updateField(
        row,
        {
          qty_inventory: Math.max(0, row.qty_inventory - 1),
          qty_due_lva: (row.qty_due_lva ?? 0) + 1,
        },
        { successMessage: 'Sent 1 jersey to laundry' }
      );
      return;
    }

    if (action === 'receive') {
      await updateField(
        row,
        {
          qty_inventory: row.qty_inventory + 1,
          qty_due_lva: Math.max(0, (row.qty_due_lva ?? 0) - 1),
        },
        { successMessage: 'Received 1 jersey back' }
      );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-blue-400 rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Loading Inventory</p>
          <p className="text-sm text-gray-500">Fetching latest data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600">Fast actions for noisy environments</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={simpleMode} onChange={(e) => { setSimpleMode(e.target.checked); try { window.localStorage.setItem('simpleMode', e.target.checked ? '1' : '0'); } catch {} }} />
            Simple Mode
          </label>
          <button
            onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
            className="btn btn-secondary btn-sm"
            title="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>
          <button
            onClick={exportData}
            className="btn btn-secondary btn-sm"
            title="Export data (Ctrl+E)"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            <Upload className="h-4 w-4" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <ReorderEmailButton filtered={filtered} />
          <button
            onClick={openAddModal}
            className="btn btn-primary btn-sm"
            title="Add new jersey (Ctrl+N)"
          >
            <Plus className="h-4 w-4" />
            Add Jersey
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      {showKeyboardHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </h3>
            <button
              onClick={() => setShowKeyboardHelp(false)}
              className="text-blue-600 hover:text-blue-800"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-blue-800">Add new jersey</span>
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Ctrl+N</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-800">Export data</span>
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Ctrl+E</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-800">Focus search</span>
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Ctrl+F</kbd>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-blue-800">Close modal</span>
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Esc</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-800">Voice command</span>
                <kbd className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Click mic</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simple Mode */}
      {simpleMode && (
        <SimplePad
          rows={rows}
          onApply={async (action, args) => {
            const match = rows.find(r => r.player_name === args.player_name && r.edition === args.edition && r.size === args.size);
            if (!match) { toast.error('Item not found'); return; }
            if (action === 'given_away') {
              await updateField(match, { qty_inventory: Math.max(0, match.qty_inventory - args.quantity) });
              toast.success(`Recorded giveaway of ${args.quantity}`);
              return;
            }
            if (action === 'to_cleaners') {
              const dec = Math.min(args.quantity, match.qty_inventory);
              await updateField(match, { qty_inventory: Math.max(0, match.qty_inventory - dec), qty_due_lva: match.qty_due_lva + dec });
              toast.success(`Sent ${dec} to laundry`);
              return;
            }
            if (action === 'ordered') {
              try { await supabase.from('activity_logs').insert({ action: 'ordered', details: { id: match.id, ...args } }); } catch {}
              toast.success('Order recorded');
              return;
            }
            if (action === 'received') {
              await updateField(match, { qty_inventory: match.qty_inventory + args.quantity });
              toast.success(`Received ${args.quantity}`);
              return;
            }
          }}
        />
      )}

      {/* Enhanced Filters and Search */}
      {!simpleMode && (
      <div className="bg-gradient-to-r from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Smart Search</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white shadow-sm"
                placeholder="Search player, edition, or size..."
                value={search}
                onChange={(e) => startTransition(() => setSearch(e.target.value))}
                aria-label="Search inventory"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Player Filter</label>
            <select 
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white shadow-sm" 
              value={selectedPlayer} 
              onChange={(e) => startTransition(() => setSelectedPlayer(e.target.value))}
              aria-label="Filter by player"
            >
              <option value="">All players</option>
              {Array.from(new Set(rows.map(r => r.player_name))).sort().map((player) => (
                <option key={player} value={player}>{player}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Edition Filter</label>
            <select 
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white shadow-sm" 
              value={edition} 
              onChange={(e) => startTransition(() => setEdition(e.target.value))}
              aria-label="Filter by edition"
            >
              <option value="">All editions</option>
              {EDITIONS.map((ed) => (
                <option key={ed} value={ed}>{ed}</option>
              ))}
            </select>
          </div>
          </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Sort By</label>
              <select
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white shadow-sm"
                value={sortBy}
                onChange={(e) => startTransition(() => setSortBy(e.target.value as any))}
                aria-label="Sort by"
              >
              <option value="player">Player Name</option>
              <option value="edition">Edition</option>
              <option value="size">Size</option>
              <option value="inventory">Inventory</option>
              <option value="lva">LVA Due</option>
              <option value="updated">Last Updated</option>
              </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Order</label>
              <button
                onClick={() => startTransition(() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm bg-white flex items-center justify-center gap-2"
                aria-label="Toggle sort order"
              >
              <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
              <span className="text-sm">{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
            </button>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Quick Filters</label>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setShowLowStockOnly(!showLowStockOnly);
                  setShowZeroStockOnly(false);
                  setShowLVAOnly(false);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  showLowStockOnly 
                    ? 'bg-red-100 text-red-700 border-2 border-red-300' 
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-gray-200'
                }`}
              >
                🔴 Low Stock
              </button>
              <button
                onClick={() => {
                  setShowZeroStockOnly(!showZeroStockOnly);
                  setShowLowStockOnly(false);
                  setShowLVAOnly(false);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  showZeroStockOnly 
                    ? 'bg-red-100 text-red-700 border-2 border-red-300' 
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-gray-200'
                }`}
              >
                ⚫ Zero Stock
              </button>
              <button
                onClick={() => {
                  setShowLVAOnly(!showLVAOnly);
                  setShowLowStockOnly(false);
                  setShowZeroStockOnly(false);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  showLVAOnly 
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' 
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-gray-200'
                }`}
              >
                📦 LVA Due
              </button>
              <button
                onClick={() => {
                  setShowLowStockOnly(false);
                  setShowZeroStockOnly(false);
                  setShowLVAOnly(false);
                  setSearch('');
                  setSelectedPlayer('');
                  setEdition('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-gray-200 transition-all"
              >
                🧹 Clear All
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">
              Showing {filtered.length} of {rows.length} items
            </span>
            {(showLowStockOnly || showZeroStockOnly || showLVAOnly || search || selectedPlayer || edition) && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                Filters active
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-600">
              {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
            </div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <button
              className="btn btn-secondary btn-sm"
            onClick={async () => {
                try {
                  const { data: settings } = await supabase.from('settings').select('low_stock_threshold').single();
                  const threshold = settings?.low_stock_threshold ?? 1;
                  const lowStock = rows.filter(r => r.qty_inventory <= threshold);
                  if (lowStock.length === 0) {
                    toast.success('No low stock items');
                    return;
                  }
                  const drafts = lowStock.map(item => buildReorderEmailDraft({
                    player_name: item.player_name,
                    edition: item.edition,
                    size: item.size,
                    qty_needed: Math.max(1, (threshold - item.qty_inventory) || 1)
                  })).join('\n\n---\n\n');
                  await navigator.clipboard.writeText(drafts);
                  toast.success(`Copied ${lowStock.length} reorder draft(s) to clipboard`);
                } catch (e) {
                  console.error('Low-stock draft error:', e);
                  toast.error('Failed to generate drafts');
                }
              }}
              title="Copy reorder email drafts for all low stock items"
            >
              Copy Low-Stock Drafts
          </button>
          </div>
        </div>
        </div>
      )}
        
      {/* Voice Controls */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-lg border border-blue-200 p-6">
        <VoiceMic rows={rows} onAction={async (command) => {
            let changed = false;
            let removedCount = 0;
            
            const resolveDefaultSize = (cmd: typeof command) => {
              if (cmd.size && cmd.size.trim()) return cmd.size.trim();
              const editionKey = (cmd.edition || '*').toLowerCase();
              const playerKey = (cmd.player_name || '*').toLowerCase();
              const keys = [
                `${playerKey}|${editionKey}`,
                `${playerKey}|*`,
                `*|${editionKey}`,
              ];
              for (const k of keys) {
                if (lastSizeDefaults[k]) return lastSizeDefaults[k];
              }
              const pool = rows.filter(r => (!cmd.edition || r.edition.toLowerCase() === cmd.edition.toLowerCase()) && (!cmd.player_name || r.player_name.toLowerCase() === (cmd.player_name as string).toLowerCase()));
              if (pool.length > 0) return pool[0].size;
              return '48';
            };

            const rememberSize = (player?: string, edition?: string, size?: string) => {
              if (!size) return;
              const pKey = (player || '*').toLowerCase();
              const eKey = (edition || '*').toLowerCase();
              setLastSizeDefaults(prev => ({
                ...prev,
                [`${pKey}|${eKey}`]: size,
                [`${pKey}|*`]: size,
                [`*|${eKey}`]: size,
              }));
            };
            
            // Handle unknown commands
            if (command.type === 'unknown') {
              console.log('Command type is unknown, ignoring...');
              toast.error('Could not understand the voice command. Please try again.');
              return false;
            }
            
            if (command.type === 'add') {
              const edition = command.edition || '';
              const size = command.size && command.size.trim() ? command.size : resolveDefaultSize(command);
              console.log('Looking for match with:', { edition, size, player_name: command.player_name });
              let match: Row | undefined;
              
              if (command.player_name) {
                const playerName = command.player_name as string;
                match = rows.find((r) =>
                  r.player_name.toLowerCase() === playerName.toLowerCase() &&
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
              } else {
                // If no specific player, find all matching items and add to the first one or create a new one
                const candidates = rows.filter((r) =>
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
                
                if (candidates.length > 0) {
                  // Add to the first matching item
                  match = candidates[0];
                } else {
                  // No matching item found - create a new one
                  console.log('No matching item found, creating new item');
                  try {
                    const { data: userRes } = await supabase.auth.getUser();
                    const updatedBy = userRes.user?.email ?? null;
                    const { data, error } = await supabase
                      .from('jerseys')
                      .insert({
                        player_name: 'Generic Player', // Default player name
                        edition: edition || 'Icon',
                        size: size || '48',
                        qty_inventory: command.quantity || 0,
                        qty_due_lva: 0,
                        updated_by: updatedBy,
                        updated_at: new Date().toISOString(),
                      })
                      .select()
                      .single();
                    
                    if (!error && data) {
                      setRows((prev) => [data as Row, ...prev]);
                      toast.success(`Created new item: ${edition || 'Icon'} size ${size || '48'} with ${command.quantity || 0} jerseys`);
                      changed = true;
                      // Don't return early - let the refresh happen at the end
                    } else {
                      console.error('Failed to create new item:', error);
                      toast.error('Failed to create new item');
                    }
                  } catch (error) {
                    console.error('Error creating new item:', error);
                    toast.error('Failed to create new item');
                    return false;
                  }
                }
              }
              
              console.log('Found match:', match);
              if (match) {
                const newQty = Math.max(0, match.qty_inventory + (command.quantity || 0));
                console.log('Updating inventory from', match.qty_inventory, 'to', newQty);
                await updateField(match, { qty_inventory: newQty });
                toast.success(`Added ${command.quantity || 0} to ${match.player_name} ${match.edition} size ${match.size}`);
                changed = true;
                rememberSize(command.player_name || match.player_name, command.edition || match.edition, match.size);
              } else {
                console.log('No match found for add command');
                toast.error(`No matching item found for ${edition} ${size ? 'size ' + size : ''} ${command.player_name ? 'for ' + command.player_name : ''}`);
                return false;
              }
            } else if (command.type === 'remove') {
              const edition = command.edition || '';
              const size = command.size && command.size.trim() ? command.size : resolveDefaultSize(command);
              console.log('Looking for match to remove with:', { edition, size, player_name: command.player_name });
              let match: Row | undefined;
              if (command.player_name) {
                const playerName = command.player_name as string;
                match = rows.find((r) =>
                  r.player_name.toLowerCase() === playerName.toLowerCase() &&
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
              } else {
                const candidates = rows.filter((r) =>
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
                match = candidates.sort((a, b) => b.qty_inventory - a.qty_inventory)[0];
              }
              console.log('Found match for remove:', match);
              if (match) {
                const newQty = Math.max(0, match.qty_inventory - (command.quantity || 0));
                console.log('Updating inventory from', match.qty_inventory, 'to', newQty);
                await updateField(match, { qty_inventory: newQty });
                toast.success(`Removed ${command.quantity || 0} from ${match.player_name} ${match.edition} size ${match.size}`);
                changed = true;
                rememberSize(command.player_name || match.player_name, command.edition || match.edition, match.size);
              } else {
                console.log('No match found for remove command');
                toast.error(`No matching item found for ${edition} ${size ? 'size ' + size : ''} ${command.player_name ? 'for ' + command.player_name : ''}`);
                return false;
              }
            } else if (command.type === 'set') {
              const targetQty = Math.max(0, command.target_quantity || 0);
              const edition = command.edition || '';
              const size = command.size && command.size.trim() ? command.size : resolveDefaultSize(command);

              let target: Row | undefined;
              if (command.player_name) {
                const playerName = command.player_name as string;
                target = rows.find((r) =>
                  r.player_name.toLowerCase() === playerName.toLowerCase() &&
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
              } else {
                const candidates = rows.filter((r) =>
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
                target = candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
              }

              // If notes indicate set_size intent, update the size itself
              if ((command as any).notes === 'set_size' && target) {
                await updateField(target, { size });
                toast.success(`Set size for ${target.player_name} ${target.edition} to ${size}`);
                rememberSize(command.player_name || target.player_name, command.edition || target.edition, size);
                return true;
              }

              if (target) {
                await updateField(target, { qty_inventory: targetQty });
                toast.success(`Set ${target.player_name} ${target.edition} size ${target.size} to ${targetQty}`);
                rememberSize(command.player_name || target.player_name, command.edition || target.edition, target.size);
                changed = true;
              } else {
                return false;
              }
            } else if (command.type === 'turn_in') {
              const qty = Math.max(1, command.quantity || 1);
              const recipient = (command.recipient || '').trim();
              const edition = command.edition || '';
              const size = command.size && command.size.trim() ? command.size : resolveDefaultSize(command);

              let target: Row | undefined;
              if (command.player_name) {
                const playerName = command.player_name as string;
                target = rows.find((r) =>
                  r.player_name.toLowerCase() === playerName.toLowerCase() &&
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
              } else {
                const candidates = rows.filter((r) =>
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
                target = candidates.sort((a, b) => b.qty_inventory - a.qty_inventory)[0];
              }

              if (target) {
                const decrement = Math.min(qty, Math.max(0, target.qty_inventory));
                if (decrement > 0) {
                  await updateField(target, { qty_inventory: target.qty_inventory - decrement });
                  try {
                    await supabase.from('activity_logs').insert({
                      actor: (await supabase.auth.getUser()).data.user?.email ?? null,
                      action: 'giveaway',
                      details: {
                        id: target.id,
                        player_name: target.player_name,
                        edition: target.edition,
                        size: target.size,
                        quantity: decrement,
                        recipient: recipient || null,
                      },
                    });
                  } catch {}
                  toast.success(`Recorded giveaway of ${decrement} ${target.edition} ${target.size}${recipient ? ' to ' + recipient : ''}`);
                  changed = true;
                  rememberSize(command.player_name || target.player_name, command.edition || target.edition, target.size);
                } else {
                  return false;
                }
              } else {
                return false;
              }
            } else if (command.type === 'order') {
              if (!command.player_name || !command.edition) return false;
              const playerName = command.player_name as string;
              const edition = command.edition as string;
              const match = rows.find((r) =>
                r.player_name.toLowerCase() === playerName.toLowerCase() &&
                r.edition.toLowerCase() === edition.toLowerCase() &&
                (!command.size || r.size === command.size)
              );
              if (match) {
                await handleOrderCall(match);
              }
            } else if (command.type === 'delete') {
              const edition = command.edition || '';
              // For delete, only filter by size if the user explicitly said a size.
              const size = command.size && command.size.trim() ? command.size : '';
              const playerName = command.player_name;
              const quantityToDelete = command.quantity || 1; // Default to 1 if no quantity specified

              let matchingItems: Row[] = [];
              
              if (playerName) {
                matchingItems = rows.filter((r) =>
                  r.player_name.toLowerCase() === playerName.toLowerCase() &&
                  (edition ? r.edition.toLowerCase() === edition.toLowerCase() : true) &&
                  (size ? r.size === size : true)
                );
              } else if (edition) {
                matchingItems = rows.filter((r) =>
                  r.edition.toLowerCase() === edition.toLowerCase() &&
                  (size ? r.size === size : true)
                );
              } else {
                // If no specific criteria, show error
                matchingItems = [];
              }

              if (matchingItems.length > 0) {
                try {
                  const { data: userRes } = await supabase.auth.getUser();
                  const updatedBy = userRes.user?.email ?? null;
                  
                  // FIXED: Delete should decrement quantities only; never hard-delete rows on voice commands
                  let remainingToDelete = quantityToDelete;
                  const updatedItems = [];
                  
                  // Process matching items until we've decremented the requested quantity
                  for (const item of matchingItems) {
                    if (remainingToDelete <= 0) break;
                    
                    const currentQuantity = item.qty_inventory || 0;
                    const toRemove = Math.min(remainingToDelete, currentQuantity);
                    const newQuantity = Math.max(0, currentQuantity - toRemove);
                    await supabase.from('jerseys')
                      .update({ qty_inventory: newQuantity })
                      .eq('id', item.id);
                    setRows(prev => prev.map(r => 
                      r.id === item.id ? { ...r, qty_inventory: newQuantity } : r
                    ));
                    removedCount += toRemove;
                    updatedItems.push({
                      id: item.id,
                      player_name: item.player_name,
                      edition: item.edition,
                      size: item.size,
                      quantity_removed: toRemove,
                      new_quantity: newQuantity,
                      action: 'reduced_quantity'
                    });
                    
                    remainingToDelete -= toRemove;
                  }
                  
                  await supabase.from('activity_logs').insert({
                    actor: updatedBy,
                    action: 'delete',
                    details: {
                      updated_items: updatedItems,
                      quantity_requested: quantityToDelete,
                      quantity_removed: quantityToDelete - remainingToDelete
                    }
                  });
                  
                  toast.success(`Removed ${quantityToDelete - remainingToDelete} item(s) from inventory`);
                  changed = true;
                } catch (error) {
                  console.error('Delete error:', error);
                  toast.error('Failed to remove items from inventory');
                }
              } else {
                toast.error('No matching items found to remove');
                return false;
              }
            } else if (command.type === 'show' || command.type === 'filter') {
              // Toggle filters based on voice intent
              const f = command.filter_type;
              if (f === 'low_stock') {
                setShowLowStockOnly(true);
                setShowZeroStockOnly(false);
                setShowLVAOnly(false);
                toast.success('Showing low stock');
                return { success: true };
              }
              if (f === 'zero_stock') {
                setShowZeroStockOnly(true);
                setShowLowStockOnly(false);
                setShowLVAOnly(false);
                toast.success('Showing zero stock');
                return { success: true };
              }
              if (f === 'lva') {
                setShowLVAOnly(true);
                setShowLowStockOnly(false);
                setShowZeroStockOnly(false);
                toast.success('Showing items due to LVA');
                return { success: true };
              }
              if (f === 'player' && command.player_name) {
                setSelectedPlayer(command.player_name);
                toast.success(`Filtered by player ${command.player_name}`);
                return { success: true };
              }
              if (f === 'edition' && command.edition) {
                setEdition(command.edition);
                toast.success(`Filtered by edition ${command.edition}`);
                return { success: true };
              }
              return false;
            } else if (command.type === 'generate') {
              const action = (command as any).action as 'reorder_email' | 'report' | 'export' | undefined;
              if (action === 'reorder_email') {
                try {
                  const { data: settings } = await supabase.from('settings').select('low_stock_threshold, reorder_email_recipient').single();
                  const threshold = settings?.low_stock_threshold ?? 1;
                  const recipient = settings?.reorder_email_recipient;
                  const lowStock = rows.filter(r => r.qty_inventory <= threshold);
                  if (lowStock.length === 0) {
                    toast.success('No low stock items to reorder');
                    return { success: true };
                  }
                  const blocks = lowStock.map(item => buildReorderEmailDraft({
                    player_name: item.player_name,
                    edition: item.edition,
                    size: item.size,
                    qty_needed: Math.max(1, (threshold - item.qty_inventory) || 1)
                  })).join('\n\n---\n\n');
                  const polished = await buildReorderEmailDraftAI(blocks);
                  const subjectMatch = polished.match(/^Subject:\s*(.*)$/m);
                  const subject = subjectMatch ? subjectMatch[1] : `Jersey Reorder Request - ${new Date().toLocaleDateString()}`;
                  const body = polished.replace(/^Subject:.*\n?/, '');
                  if (recipient) {
                    const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.location.href = mailto;
                    toast.success(`Reorder email opened in email app (${lowStock.length} item${lowStock.length === 1 ? '' : 's'})`);
                  } else {
                    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
                    toast.success('Reorder email copied to clipboard');
                  }
                  return { success: true };
                } catch {
                  return false;
                }
              }
              if (action === 'report') {
                // Reuse existing report generator through settings or provide quick path not available here
                toast('Open Settings → Generate Inventory Report');
                return { success: true };
              }
              if (action === 'export') {
                await exportData();
                toast.success('Exported inventory CSV');
                return { success: true };
              }
              return false;
            }
            
            // Force refresh the inventory data after any voice command
            console.log('Refreshing inventory data after voice command...');
            try {
              const { data, error } = await supabase
                .from('jerseys')
                .select('*')
                .order('player_name');
              if (!error && data) {
                setRows(data as Row[]);
                console.log('Inventory data refreshed successfully, new count:', data.length);
              } else {
                console.error('Error refreshing inventory:', error);
              }
            } catch (error) {
              console.error('Failed to refresh inventory data:', error);
            }
            return { success: !!changed, info: { removed: removedCount } };
          }} />
      </div>

      {/* Low Stock Banner + Stats Summary */}
      {filtered.some(r => r.qty_inventory <= 1) && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-3 flex items-center justify-between">
          <div>
            <strong>Low stock alert:</strong> {filtered.filter(r => r.qty_inventory <= 1).length} item(s) at or below threshold.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowLowStockOnly(true)}>Show low stock</button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
            </div>
            <Package className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Low Stock</p>
              <p className="text-2xl font-bold text-red-600">{filtered.filter(r => r.qty_inventory <= 1).length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-green-600">${filtered.reduce((sum, r) => sum + (r.qty_inventory * 75), 0).toLocaleString()}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Due to LVA</p>
              <p className="text-2xl font-bold text-orange-600">{filtered.reduce((sum, r) => sum + r.qty_due_lva, 0)}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Inventory Table - Desktop View */}
      {!simpleMode && (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '200px'}}>
                  <div className="flex items-center gap-2">
                    Player
                    <Shield className="h-3 w-3 text-green-500" />
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '150px'}}>Edition</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '80px'}}>Size</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '120px'}}>
                  <div className="flex items-center gap-2">
                    Inventory
                    <Warning className="h-3 w-3 text-orange-500" />
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '120px'}}>At Laundry</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '100px'}}>Status</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '140px'}}>Last Updated</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '120px'}}>Updated By</th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{minWidth: '200px'}}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 ${r.qty_inventory <= 1 ? 'bg-gradient-to-r from-red-50 to-pink-50 border-l-4 border-red-400' : ''}`}>
                  <td className="px-4 py-4" style={{minWidth: '200px'}}>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                      value={r.player_name}
                      onChange={(e) => setRows((prev) => prev.map((row) => row.id === r.id ? { ...row, player_name: e.target.value } : row))}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== r.player_name) updateField(r, { player_name: value });
                      }}
                      aria-label={`Edit player name for ${r.player_name}`}
                      placeholder="Player name"
                    />
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '150px'}}>
                    <select
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                      value={r.edition}
                      onChange={(e) => updateField(r, { edition: e.target.value as JerseyEdition })}
                    >
                      {EDITIONS.map((ed) => (
                        <option key={ed} value={ed}>{ed}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '80px'}}>
                    <input 
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 focus:bg-white" 
                      value={r.size} 
                      onChange={(e) => setRows((prev) => prev.map((row) => row.id === r.id ? { ...row, size: e.target.value } : row))}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== r.size) updateField(r, { size: value });
                      }}
                      aria-label={`Edit size for ${r.player_name}`}
                      placeholder="Size"
                    />
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '120px'}}>
                    <Adjuster 
                      value={r.qty_inventory} 
                      onChange={(v) => updateField(r, { qty_inventory: v })} 
                    />
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '120px'}}>
                    <Adjuster 
                      value={r.qty_due_lva} 
                      onChange={(v) => updateField(r, { qty_due_lva: v })} 
                    />
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '100px'}}>
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${
                      r.qty_inventory <= 1 
                        ? 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300' 
                        : 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300'
                    }`}>
                      {r.qty_inventory <= 1 ? 'Low Stock' : 'Normal'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600" style={{minWidth: '140px'}}>
                    <div className="font-semibold text-gray-900">{new Date(r.updated_at).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-500">{new Date(r.updated_at).toLocaleTimeString()}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600" style={{minWidth: '120px'}}>
                    <span className="font-semibold text-gray-900">{r.updated_by || '-'}</span>
                  </td>
                  <td className="px-4 py-4" style={{minWidth: '200px'}}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all duration-200 shadow-sm border border-blue-200"
                        onClick={() => setTimeout(() => handleOrderCall(r), 0)}
                        title="Place order call"
                        aria-label="Place order call"
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        Order
                      </button>
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg hover:from-gray-100 hover:to-gray-200 transition-all duration-200 shadow-sm border border-gray-200"
                        onClick={() => setTimeout(() => turnInOne(r), 0)}
                        title="Turn in 1 (dec inv, inc LVA)"
                        aria-label="Turn in one"
                      >
                        T1
                      </button>
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg hover:from-gray-100 hover:to-gray-200 transition-all duration-200 shadow-sm border border-gray-200"
                        onClick={() => setTimeout(() => sendToLeague(r), 0)}
                        title="Send quantity to league (LVA)"
                        aria-label="Send to league"
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send
                      </button>
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-green-700 bg-gradient-to-r from-green-50 to-green-100 rounded-lg hover:from-green-100 hover:to-green-200 transition-all duration-200 shadow-sm border border-green-200"
                        onClick={() => setTimeout(() => handleOptimizeOrder(r), 0)}
                        title="Optimize order quantity"
                        aria-label="Optimize order"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Optimize
                      </button>
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-purple-700 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg hover:from-purple-100 hover:to-purple-200 transition-all duration-200 shadow-sm border border-purple-200"
                        onClick={() => setTimeout(async () => {
                          const fallback = buildReorderEmailDraft({
                            player_name: r.player_name,
                            edition: r.edition,
                            size: r.size,
                            qty_needed: Math.max(1, (5 - r.qty_inventory))
                          });
                          const draft = await buildReorderEmailDraftAI(fallback);
                          await navigator.clipboard.writeText(draft);
                          toast.success('Reorder email draft copied to clipboard');
                        }, 0)}
                        title="Copy reorder email"
                        aria-label="Copy reorder email"
                      >
                        📧
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <Package className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No items found</h3>
            <p className="text-gray-500">No items match your current search criteria</p>
          </div>
        )}
      </div>
      )}

      {/* Quick Actions (mobile-first, also works on desktop) */}
      <QuickActions
        rows={rows}
        onApply={async (action, args) => {
          const match = rows.find(r => r.player_name === args.player_name && r.edition === args.edition && r.size === args.size);
          if (!match) {
            toast.error('Item not found');
            return;
          }
          if (action === 'given_away') {
            await updateField(match, { qty_inventory: Math.max(0, match.qty_inventory - args.quantity) });
            toast.success(`Recorded giveaway of ${args.quantity}`);
            return;
          }
          if (action === 'to_cleaners') {
            const dec = Math.min(args.quantity, match.qty_inventory);
            await updateField(match, { qty_inventory: Math.max(0, match.qty_inventory - dec), qty_due_lva: match.qty_due_lva + dec });
            toast.success(`Sent ${dec} to laundry`);
            return;
          }
          if (action === 'ordered') {
            // For ordered, we do not change on-hand yet; log only
            try { await supabase.from('activity_logs').insert({ action: 'ordered', details: { id: match.id, ...args } }); } catch {}
            toast.success('Order recorded');
            return;
          }
          if (action === 'received') {
            await updateField(match, { qty_inventory: match.qty_inventory + args.quantity });
            toast.success(`Received ${args.quantity}`);
            return;
          }
        }}
      />

      {/* Mobile Cards View (visible only on mobile) */}
      <div className="sm:hidden space-y-5 px-2 pb-10">
        {filtered.map((r) => {
          const updatedAt = new Date(r.updated_at);
          const updatedLabel = `${updatedAt.toLocaleDateString()} • ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          const locker = r.qty_locker ?? 0;
          const closet = r.qty_closet ?? 0;
          const canGive = r.qty_inventory > 0;
          const canLaundry = r.qty_inventory > 0;
          const canReceive = (r.qty_due_lva ?? 0) > 0;

          return (
            <div
              key={r.id}
              className="rounded-3xl bg-white/90 shadow-xl ring-1 ring-slate-200/60 backdrop-blur-sm p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-lg font-bold text-slate-900 truncate">{r.player_name}</p>
                  <p className="text-sm font-medium text-slate-500">
                    {r.edition} • Size {r.size}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
                    r.qty_inventory <= 1
                      ? 'bg-gradient-to-r from-rose-100 to-rose-200 text-rose-700 border border-rose-300'
                      : 'bg-gradient-to-r from-emerald-100 to-emerald-200 text-emerald-700 border border-emerald-300'
                  }`}
                >
                  {r.qty_inventory <= 1 ? 'Low Stock' : 'Ready'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-slate-50 px-3 py-3 shadow-inner">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">On Hand</p>
                  <p className="text-2xl font-bold text-slate-900">{r.qty_inventory}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-3 py-3 shadow-inner">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Laundry</p>
                  <p className="text-2xl font-bold text-indigo-900">{r.qty_due_lva ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-3 py-3 shadow-inner">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Locker • Closet</p>
                  <p className="text-sm font-bold text-sky-900">
                    {locker} • {closet}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                <span>{updatedLabel}</span>
                <span>{r.updated_by || 'Auto'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleMobileAction(r, 'give')}
                  disabled={!canGive}
                  className={`rounded-2xl py-2.5 text-xs font-extrabold tracking-wide uppercase transition shadow-md ${
                    canGive
                      ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-rose-500/40 active:scale-[0.98]'
                      : 'bg-rose-100 text-rose-400 cursor-not-allowed opacity-70'
                  }`}
                >
                  Give Away
                </button>
                <button
                  type="button"
                  onClick={() => handleMobileAction(r, 'laundry')}
                  disabled={!canLaundry}
                  className={`rounded-2xl py-2.5 text-xs font-extrabold tracking-wide uppercase transition shadow-md ${
                    canLaundry
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-indigo-500/40 active:scale-[0.98]'
                      : 'bg-blue-100 text-blue-400 cursor-not-allowed opacity-70'
                  }`}
                >
                  To Laundry
                </button>
                <button
                  type="button"
                  onClick={() => handleMobileAction(r, 'receive')}
                  disabled={!canReceive}
                  className={`rounded-2xl py-2.5 text-xs font-extrabold tracking-wide uppercase transition shadow-md ${
                    canReceive
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/40 active:scale-[0.98]'
                      : 'bg-emerald-100 text-emerald-400 cursor-not-allowed opacity-70'
                  }`}
                >
                  Receive
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Add Jersey</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Player Name</label>
                <input
                  className="input w-full"
                  value={newItem.player_name}
                  onChange={(e) => setNewItem((s) => ({ ...s, player_name: e.target.value }))}
                  placeholder="e.g., Jalen Green"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Edition</label>
                <select
                  className="input w-full"
                  value={newItem.edition}
                  onChange={(e) => setNewItem((s) => ({ ...s, edition: e.target.value as JerseyEdition }))}
                >
                  {EDITIONS.map((ed) => (
                    <option key={ed} value={ed}>{ed}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Size</label>
                  <input
                    className="input w-full"
                    value={newItem.size}
                    onChange={(e) => setNewItem((s) => ({ ...s, size: e.target.value }))}
                    placeholder="48"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Inventory</label>
                  <input
                    type="number"
                    className="input w-full"
                    value={newItem.qty_inventory}
                    onChange={(e) => setNewItem((s) => ({ ...s, qty_inventory: Number(e.target.value) }))}
                    min={0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Due to LVA</label>
                <input
                  type="number"
                  className="input w-full"
                  value={newItem.qty_due_lva}
                  onChange={(e) => setNewItem((s) => ({ ...s, qty_due_lva: Number(e.target.value) }))}
                  min={0}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)} disabled={adding}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitNewItem} disabled={adding}>
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


