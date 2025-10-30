import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { JerseyItem } from '../../types';
import toast from 'react-hot-toast';
import { VoiceMic } from '../inventory/VoiceMic';

export function Roster() {
  const [rows, setRows] = useState<JerseyItem[]>([]);
  const [activePlayer, setActivePlayer] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('jerseys').select('*');
      setRows((data || []) as JerseyItem[]);
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

  const [qty, setQty] = useState(1);

  const updateRow = async (type: 'giveaway' | 'laundry' | 'receive', r: typeof rows[0], qty = 1) => {
    if (!r) return;
    let fields: any = {};
    qty = Math.max(1, qty);
    if (type === 'giveaway') {
      fields.qty_inventory = Math.max(0, (r.qty_inventory ?? 0) - qty);
    }
    if (type === 'laundry') {
      const dec = Math.min(qty, r.qty_inventory ?? 0);
      fields.qty_inventory = Math.max(0, (r.qty_inventory ?? 0) - dec);
      fields.qty_due_lva = (r.qty_due_lva ?? 0) + dec;
    }
    if (type === 'receive') {
      fields.qty_inventory = (r.qty_inventory ?? 0) + qty;
      fields.qty_due_lva = Math.max(0, (r.qty_due_lva ?? 0) - qty);
    }
    try {
      const { data, error } = await supabase
        .from('jerseys')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .select()
        .single();
      if (error) throw error;
      setRows(prev => prev.map(row => row.id === r.id ? { ...row, ...fields } : row));
      if (type === 'giveaway') toast.success(`Given away ${qty}!`);
      if (type === 'laundry') toast.success(`Sent ${qty} to Laundry!`);
      if (type === 'receive') toast.success(`Received ${qty}!`);
    } catch (e) {
      toast.error('Error updating inventory.');
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen pt-3 pb-28 relative">
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
          <button key={p.name} className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-md hover:shadow-lg transition p-4 flex items-center justify-between gap-4" onClick={() => setActivePlayer(p.name)}>
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
      {activePlayer && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center">
          <div className="card w-full max-w-lg rounded-t-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between bg-gray-900 text-white px-5 py-4">
              <span className="text-lg font-extrabold">{activePlayer}</span>
              <button onClick={() => setActivePlayer(null)} className="text-2xl px-2 py-1">×</button>
            </div>
            {/* Player subtitle */}
            <div className="text-base px-5 pt-1 pb-3 text-gray-500 font-medium">{rows.filter(r => r.player_name === activePlayer).length} Jersey Styles</div>
            {/* Jersey Styles, for each row with player_name === activePlayer */}
            <div className="space-y-6 px-3 pb-4">
              {rows.filter(r => r.player_name === activePlayer).map((r, idx) => (
                <div key={r.id || idx} className="rounded-2xl bg-white shadow-md p-4 flex flex-col gap-3">
                  {/* Style/edition title */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg font-bold text-gray-900">{r.edition} Edition</span>
                    <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-bold shadow">{r.size}</span>
                  </div>
                  {/* Pills: Locker, Closet, Laundry, Min/Proj */}
                  <div className="flex flex-wrap gap-2 justify-between mt-1">
                    <span className="inline-flex items-center font-bold bg-blue-50 border border-blue-300 rounded-full px-3 py-1 text-xs">Locker: {r.qty_locker ?? 0} / 3</span>
                    <span className="inline-flex items-center font-bold bg-yellow-50 border border-yellow-300 rounded-full px-3 py-1 text-xs">Closet: {r.qty_closet ?? 0} / 5</span>
                    <span className="inline-flex items-center font-medium bg-gray-100 rounded-full px-3 py-1 text-xs">Min Required: <span className="font-bold ml-1">2</span></span>
                    <span className="inline-flex items-center font-medium bg-gray-100 rounded-full px-3 py-1 text-xs">Projected: <span className="font-bold ml-1">7</span></span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="inline-flex items-center font-bold bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 text-xs">Laundry: {r.qty_due_lva ?? 0}</span>
                    <span className="inline-flex items-center font-bold bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs">In Transit: 0</span>
                  </div>
                  {/* Quantity Selector + Inline MIC */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700 font-medium">Qty</span>
                      <input
                        type="number"
                        min={1}
                        max={r.qty_inventory ?? 100}
                        value={qty}
                        onChange={e => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                        className="inline-block w-16 rounded-lg border border-gray-300 text-base px-2 py-1 text-center font-bold ring-1 ring-inset ring-blue-200 bg-gray-50 focus:outline-none focus:ring-blue-400 focus:border-blue-400"
                        style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                      />
                      {[1,2,3,5].map(n => (
                        <button key={n} className={`px-3 py-1.5 text-xs rounded-xl font-semibold border ${qty===n ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-50'}`} onClick={() => setQty(n)}>{n}</button>
                      ))}
                    </div>
                    <div className="ml-auto">
                      <VoiceMic
                        rows={[r]}
                        onAction={async (command) => {
                          let type: 'giveaway'|'laundry'|'receive'|undefined, q = 1;
                          if (command.type === 'turn_in' || command.type === 'giveaway' || command.type === 'remove' || command.type === 'delete') type = 'giveaway';
                          if (command.type === 'laundry_return') type = 'receive';
                          if (command.type === 'add') type = 'receive';
                          if (command.type === 'set' || command.type === 'order') type = undefined;
                          q = Number(command.quantity || command.target_quantity || qty || 1);
                          if (!type) return { success: false };
                          await updateRow(type, r, q);
                          return { success: true };
                        }}
                      />
                    </div>
                  </div>
                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    <button className="w-full py-3 rounded-xl font-extrabold text-white bg-red-600 active:scale-[0.99] shadow-lg" onClick={() => updateRow('giveaway', r, qty)}>Give Away</button>
                    <button className="w-full py-3 rounded-xl font-extrabold text-white bg-blue-600 active:scale-[0.99] shadow-lg" onClick={() => updateRow('laundry', r, qty)}>To Laundry</button>
                    <button className="w-full py-3 rounded-xl font-extrabold text-white bg-green-600 active:scale-[0.99] shadow-lg" onClick={() => updateRow('receive', r, qty)}>Receive</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Large Centered Glassmorphic MIC - always visible (mobile + desktop), above all */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center items-end pb-4">
        <div className="w-full max-w-xl mx-auto px-4">
          <div className="rounded-full bg-white/70 backdrop-blur ring-1 ring-blue-300 border border-blue-100 flex justify-center items-center py-3 shadow-2xl" style={{boxShadow:'0 10px 28px rgba(24,102,255,0.18),0 4px 24px rgba(65,0,150,0.14)'}}>
            <VoiceMic
              rows={rows}
              onAction={async (command) => {
                let type: 'giveaway'|'laundry'|'receive'|undefined, q = 1;
                if (command.type === 'turn_in' || command.type === 'giveaway' || command.type === 'remove' || command.type === 'delete') type = 'giveaway';
                if (command.type === 'laundry_return') type = 'receive';
                if (command.type === 'add') type = 'receive';
                if (command.type === 'set' || command.type === 'order') type = undefined;
                q = Number(command.quantity || command.target_quantity || 1);
                const target = resolveTarget(command);
                if (!type || !target) return { success: false };
                await updateRow(type, target, q);
                return { success: true };
              }}
              large={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


