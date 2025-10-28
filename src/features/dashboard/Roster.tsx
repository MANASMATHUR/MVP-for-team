import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { JerseyItem } from '../../types';
import { SimplePad } from '../../components/SimplePad';
import { VoiceMic } from '../inventory/VoiceMic';
import toast from 'react-hot-toast';

export function Roster() {
  const [rows, setRows] = useState<JerseyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [globalQuick, setGlobalQuick] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('jerseys').select('*');
      setRows((data || []) as JerseyItem[]);
      setLoading(false);
    })();
  }, []);

  const players = useMemo(() => {
    const byPlayer = new Map<string, { ready: number; total: number }>();
    for (const r of rows) {
      const s = byPlayer.get(r.player_name) || { ready: 0, total: 0 };
      s.total += 1;
      if (r.qty_inventory > 0) s.ready += 1; // readiness counts on-hand only
      byPlayer.set(r.player_name, s);
    }
    return Array.from(byPlayer.entries()).map(([name, s]) => ({ name, ready: s.ready, total: s.total }));
  }, [rows]);

  const readyCount = players.filter(p => p.ready > 0).length;

  const resolveTarget = (args: { player_name?: string; edition?: string; size?: string; quantity?: number }) => {
    const edition = args.edition || '';
    const size = (args.size || '').trim();
    let match: JerseyItem | undefined;
    if (args.player_name) {
      const player = (args.player_name as string).toLowerCase();
      match = rows.find(r => r.player_name.toLowerCase() === player && (!edition || r.edition.toLowerCase() === edition.toLowerCase()) && (!size || r.size === size));
    }
    if (!match) {
      const candidates = rows.filter(r => (!edition || r.edition.toLowerCase() === edition.toLowerCase()) && (!size || r.size === size));
      if (candidates.length > 0) {
        match = candidates.sort((a, b) => b.qty_inventory - a.qty_inventory)[0];
      }
    }
    return match;
  };

  const handleVoiceAction = async (command: any) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const updatedBy = (userRes as any)?.user?.email ?? null;
      const match = resolveTarget({ player_name: command.player_name, edition: command.edition, size: command.size, quantity: command.quantity });
      if (!match) return false;

      const qty = Math.max(1, command.quantity || command.target_quantity || 1);
      const nowIso = new Date().toISOString();

      if (command.type === 'add') {
        await supabase.from('jerseys').update({ qty_inventory: match.qty_inventory + qty, updated_at: nowIso, updated_by: updatedBy }).eq('id', match.id);
        toast.success(`Added ${qty} to ${match.player_name} ${match.edition}`);
        return { success: true };
      }
      if (command.type === 'remove' || command.type === 'delete') {
        await supabase.from('jerseys').update({ qty_inventory: Math.max(0, match.qty_inventory - qty), updated_at: nowIso, updated_by: updatedBy }).eq('id', match.id);
        toast.success(`Removed ${qty} from ${match.player_name} ${match.edition}`);
        return { success: true, info: { removed: qty } };
      }
      if (command.type === 'set') {
        await supabase.from('jerseys').update({ qty_inventory: Math.max(0, command.target_quantity || 0), updated_at: nowIso, updated_by: updatedBy }).eq('id', match.id);
        toast.success(`Set ${match.player_name} ${match.edition} to ${command.target_quantity || 0}`);
        return { success: true, info: { setTo: command.target_quantity || 0 } };
      }
      if (command.type === 'turn_in') {
        // If recipient mentions cleaner/laundry, move to laundry; else treat as giveaway
        const recipient = (command.recipient || '').toString().toLowerCase();
        if (recipient.includes('clean') || recipient.includes('laund')) {
          const dec = Math.min(qty, match.qty_inventory);
          const due = new Date();
          due.setDate(due.getDate() + 2);
          await supabase.from('jerseys').update({ qty_inventory: Math.max(0, match.qty_inventory - dec), qty_due_lva: match.qty_due_lva + dec, laundry_due_at: due.toISOString(), updated_at: nowIso, updated_by: updatedBy }).eq('id', match.id);
          toast.success(`Sent ${dec} to laundry for ${match.player_name}`);
        } else {
          await supabase.from('jerseys').update({ qty_inventory: Math.max(0, match.qty_inventory - qty), updated_at: nowIso, updated_by: updatedBy }).eq('id', match.id);
          await supabase.from('activity_logs').insert({ actor: updatedBy, action: 'giveaway', details: { id: match.id, qty, recipient: command.recipient || null } });
          toast.success(`Recorded giveaway of ${qty}`);
        }
        return { success: true };
      }
      if (command.type === 'order') {
        await supabase.from('activity_logs').insert({ actor: updatedBy, action: 'ordered', details: { id: match.id, qty, edition: match.edition, size: match.size } });
        toast.success('Order recorded');
        return { success: true };
      }
      return false;
    } catch (e) {
      toast.error('Voice action failed');
      return false;
    } finally {
      const { data } = await supabase.from('jerseys').select('*');
      setRows((data || []) as JerseyItem[]);
    }
  };

  const applyQuickAction = async (
    action: 'given_away' | 'to_cleaners' | 'ordered' | 'received',
    args: { player_name: string; edition: string; size: string; quantity: number }
  ) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const updatedBy = (userRes as any)?.user?.email ?? null;
      let match = resolveTarget(args);

      // If no exact match, create a new row to avoid user confusion
      if (!match) {
        const insert = await supabase
          .from('jerseys')
          .insert({
            player_name: args.player_name,
            edition: args.edition,
            size: args.size,
            qty_inventory: 0,
            qty_due_lva: 0,
            updated_by: updatedBy,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        match = insert.data as any;
      }

      if (!match) {
        toast.error('Item not found or could not be created');
        return;
      }

      const qty = Math.max(1, Number(args.quantity) || 1);
      const nowIso = new Date().toISOString();

      if (action === 'given_away') {
        await supabase
          .from('jerseys')
          .update({ qty_inventory: Math.max(0, match.qty_inventory - qty), updated_at: nowIso, updated_by: updatedBy })
          .eq('id', match.id);
        toast.success(`Recorded giveaway of ${qty}`);
      } else if (action === 'to_cleaners') {
        const dec = Math.min(qty, match.qty_inventory);
        const due = new Date();
        due.setDate(due.getDate() + 2);
        await supabase
          .from('jerseys')
          .update({
            qty_inventory: Math.max(0, match.qty_inventory - dec),
            qty_due_lva: (match.qty_due_lva || 0) + dec,
            laundry_due_at: due.toISOString(),
            updated_at: nowIso,
            updated_by: updatedBy,
          })
          .eq('id', match.id);
        toast.success(`Sent ${dec} to laundry`);
      } else if (action === 'ordered') {
        await supabase.from('activity_logs').insert({ actor: updatedBy, action: 'ordered', details: { id: match.id, ...args } });
        toast.success('Order recorded');
      } else if (action === 'received') {
        await supabase
          .from('jerseys')
          .update({ qty_inventory: match.qty_inventory + qty, updated_at: nowIso, updated_by: updatedBy })
          .eq('id', match.id);
        toast.success(`Received ${qty}`);
      }

      const { data } = await supabase.from('jerseys').select('*');
      setRows((data || []) as JerseyItem[]);
    } catch (e) {
      toast.error('Action failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Next Game banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80">Next Game</div>
            <div className="text-2xl font-bold mt-1">vs Los Angeles Lakers</div>
            <div className="text-sm mt-3 opacity-80">Mon, Nov 3 • 19:30 • Home</div>
          </div>
          <span className="text-xs bg-white/10 px-3 py-1 rounded-full">Home</span>
        </div>
      </div>

      {/* Critical banner */}
      <div className="rounded-2xl p-4 bg-red-600 text-white flex items-center justify-between shadow">
        <div>
          <div className="uppercase text-xs tracking-wide opacity-90">Critical</div>
          <div className="text-sm opacity-90">Players need jerseys</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-extrabold">{readyCount}/{players.length}</div>
          <button
            className="btn btn-sm btn-white text-red-700"
            onClick={async () => {
              // Suggest reorder per vendor for non-ready players
              const { data: settings } = await supabase.from('settings').select('locker_max, closet_max, low_stock_threshold').single();
              const threshold = settings?.low_stock_threshold ?? 1;
              const byVendor: Record<string, number> = {};
              const { data: all } = await supabase.from('jerseys').select('*');
              (all || []).forEach((r: any) => {
                if ((r.qty_inventory || 0) <= threshold) {
                  const need = Math.max(1, threshold - (r.qty_inventory || 0));
                  const vendor = r.vendor || 'Unknown Vendor';
                  byVendor[vendor] = (byVendor[vendor] || 0) + need;
                }
              });
              const parts = Object.entries(byVendor).map(([v, q]) => `${v}: ${q}`).join(' · ');
              if (!parts) {
                toast.success('All vendors OK — no immediate reorder needed');
              } else {
                toast(`Reorder suggestion → ${parts}`, { icon: '📦' });
              }
            }}
          >
            Suggest Reorder
          </button>
        </div>
      </div>

      {/* Mic */}
      <div className="flex items-center justify-end">
        <VoiceMic rows={rows} onAction={handleVoiceAction} />
      </div>

      {/* Roster list */}
      <div className="space-y-3">
        {loading && <div className="text-gray-500">Loading roster…</div>}
        {!loading && players.map((p) => (
          <button key={p.name} className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow transition p-4 flex items-center justify-between" onClick={() => setActivePlayer(p.name)}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">{(p.name.match(/\d+/)?.[0] || '').slice(-2) || (p.name.charCodeAt(0) % 99)}</div>
              <div>
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-500">{p.total} styles</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${p.ready > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-400">›</span>
            </div>
          </button>
        ))}
      </div>

      {activePlayer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 modal-open">
          <div className="card w-full sm:max-w-md p-4">
            <h3 className="text-lg font-semibold mb-3">Quick Update • {activePlayer}</h3>
            <SimplePad
              rows={rows}
              presetPlayer={activePlayer}
              onApply={async (action, args) => {
                await applyQuickAction(action, args);
                setActivePlayer(null);
              }}
              onClose={() => setActivePlayer(null)}
            />
          </div>
        </div>
      )}

      {globalQuick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 modal-open">
          <div className="card w-full sm:max-w-md p-4">
            <h3 className="text-lg font-semibold mb-3">Quick Update</h3>
            <SimplePad
              rows={rows}
              onApply={async (action, args) => {
                await applyQuickAction(action, args);
                setGlobalQuick(false);
              }}
              onClose={() => setGlobalQuick(false)}
            />
          </div>
        </div>
      )}

      {/* Sticky mobile action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden">
        <div className="mx-3 mb-3 rounded-2xl shadow-lg border border-gray-200 bg-white p-3 flex items-center justify-between">
          <button
            className="flex-1 mr-2 py-3 rounded-xl text-base font-bold text-white bg-blue-600 active:scale-[0.99]"
            onClick={() => setGlobalQuick(true)}
          >
            Quick Update
          </button>
          <div className="ml-2 flex-1">
            <VoiceMic rows={rows} large locked onAction={handleVoiceAction} />
          </div>
        </div>
      </div>
    </div>
  );
}


