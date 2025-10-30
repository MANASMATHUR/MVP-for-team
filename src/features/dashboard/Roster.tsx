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
    <div className="bg-gray-50 min-h-screen pt-3 pb-12">
      {/* Next Game BANNER */}
      <div className="mx-3 mb-3 rounded-2xl bg-gray-900 p-4 shadow flex flex-col gap-2 text-white">
        <div className="text-lg font-bold leading-snug">Next Game</div>
        <div className="text-2xl font-black tracking-tight">vs Los Angeles Lakers</div>
        <div className="flex text-sm gap-6 items-center mt-1 opacity-90">
          <span className="flex items-center gap-1"><svg width="1em" height="1em" viewBox="0 0 20 20" fill="currentColor" className="inline align-middle text-gray-300"><circle cx="10" cy="10" r="10"/></svg>Mon, Nov 3</span>
          <span className="flex items-center gap-1"><svg width="1em" height="1em" viewBox="0 0 20 20" fill="currentColor" className="inline align-middle text-gray-300"><circle cx="10" cy="10" r="10"/></svg>19:30</span>
          <span className="flex items-center gap-1"><svg width="1em" height="1em" viewBox="0 0 20 20" fill="currentColor" className="inline align-middle text-gray-300"><circle cx="10" cy="10" r="10"/></svg>Home</span>
          <span className="ml-auto"><span className="inline-block px-3 py-1 text-xs font-bold rounded-full bg-blue-600">Home</span></span>
        </div>
      </div>
      {/* CRITICAL Banner */}
      <div className="mx-3 rounded-2xl bg-red-600 flex items-center justify-between p-4 mb-4 shadow text-white">
        <div className="flex items-center gap-3">
          <svg width="2em" height="2em" viewBox="0 0 20 20" fill="currentColor" className="text-white"><circle cx="10" cy="10" r="10" fill="#d32f2f"/><text x="10" y="15" textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">!</text></svg>
          <div>
            <div className="font-bold text-lg">CRITICAL</div>
            <div className="text-xs text-white/90">Players need jerseys</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="font-black text-3xl text-white">2/5</div>
          <div className="text-xs">Players Ready</div>
        </div>
      </div>
      {/* Team Roster Title */}
      <div className="font-bold text-lg px-4 pt-1 pb-3">Team Roster</div>
      {/* PLAYER CARDS */}
      <div className="space-y-4 px-2 pb-8">
        {players.map((p, i) => (
          <button key={p.name} className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-md hover:shadow-lg transition p-4 flex items-center justify-between gap-4">
            <span className="flex items-center gap-4">
              <span className="h-11 w-11 rounded-full flex items-center justify-center font-black text-xl bg-blue-600 text-white shadow-inner">{p.name.match(/\d+/)?.[0] || ((p.name.charCodeAt(0) + i*2) % 99) }</span>
              <span className="flex flex-col">
                <span className="font-bold text-base leading-tight text-gray-900">{p.name}</span>
                <span className="text-xs text-gray-500 mt-1">{p.total} styles &nbsp; &bull; &nbsp; {p.ready} Home</span>
              </span>
            </span>
            <span className="flex gap-3 items-center">
              {/* status pip: green, red, yellow */}
              <span className={`h-5 w-5 rounded-full border-2 ${p.ready > 0 ? 'bg-green-400 border-green-700' : p.ready === 0 ? 'bg-red-400 border-red-700' : 'bg-yellow-400 border-yellow-600'}`}></span>
              <span className="text-gray-400">›</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


