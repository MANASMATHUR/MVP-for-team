import { useEffect, useMemo, useState, memo } from 'react';
import type { JerseyItem, JerseyEdition } from '../types';

type ActionType = 'given_away' | 'to_cleaners' | 'ordered' | 'received';

interface SimplePadProps {
  rows: JerseyItem[];
  onApply: (action: ActionType, args: { player_name: string; edition: JerseyEdition; size: string; quantity: number }) => Promise<void>;
  presetPlayer?: string;
  defaultEdition?: JerseyEdition;
  defaultSize?: string;
  onClose?: () => void;
}

function SimplePadImpl({ rows, onApply, presetPlayer, defaultEdition = 'Icon', defaultSize = '48', onClose }: SimplePadProps) {
  const players = useMemo(() => Array.from(new Set(rows.map(r => r.player_name))).sort(), [rows]);
  const [query, setQuery] = useState(presetPlayer || '');
  const [player, setPlayer] = useState(presetPlayer || '');
  const [edition, setEdition] = useState<JerseyEdition>(defaultEdition);
  const [size, setSize] = useState(defaultSize);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState<ActionType | null>(null);

  useEffect(() => {
    // Auto-complete player from query
    if (!query) return;
    const match = players.find(p => p.toLowerCase().includes(query.toLowerCase()));
    if (match) setPlayer(match);
  }, [query, players]);

  // Load last used edition/size for preset player to reduce taps
  useEffect(() => {
    try {
      const key = `last-pref:${player}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { edition?: JerseyEdition; size?: string };
        if (parsed.edition) setEdition(parsed.edition);
        if (parsed.size) setSize(parsed.size);
      }
    } catch {}
  }, [player]);

  const apply = async (action: ActionType) => {
    if (!player) return;
    setLoading(action);
    try {
      // Remember choices for next time
      try { window.localStorage.setItem(`last-pref:${player}`, JSON.stringify({ edition, size })); } catch {}
      await onApply(action, { player_name: player, edition, size, quantity: Math.max(1, qty || 1) });
      setQty(1);
    } finally {
      setLoading(null);
    }
  };

  const Button = ({ action, label, color }: { action: ActionType; label: string; color: 'red' | 'orange' | 'blue' | 'green' }) => (
    <button
      className={`w-full py-5 rounded-2xl text-lg font-extrabold border shadow-sm active:scale-[0.99] transition
        ${color === 'red' ? 'text-white bg-red-600 border-red-700' : ''}
        ${color === 'orange' ? 'text-white bg-orange-600 border-orange-700' : ''}
        ${color === 'blue' ? 'text-white bg-blue-600 border-blue-700' : ''}
        ${color === 'green' ? 'text-white bg-green-600 border-green-700' : ''}
      `}
      disabled={!player || !!loading}
      onClick={() => apply(action)}
    >
      {loading === action ? 'Saving…' : label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3">
          {!presetPlayer && (
            <input
              className="input w-full"
              placeholder="Type or scan player (e.g., Jalen Green)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {presetPlayer ? (
              <input className="input" value={player} readOnly />
            ) : (
              <select className="input" value={player} onChange={(e) => setPlayer(e.target.value)}>
                <option value="">Player</option>
                {players.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {(['Icon','Statement','Association','City'] as JerseyEdition[]).map(ed => (
                <button key={ed} className={`px-3 py-2 rounded-xl text-sm font-semibold border ${edition === ed ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 text-gray-700 border-gray-200'}`} onClick={() => setEdition(ed)}>
                  {ed}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {['46','48','50','52','54','56','58','60'].map(s => (
                <button key={s} className={`px-3 py-2 rounded-xl text-sm font-semibold border ${size === s ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 text-gray-700 border-gray-200'}`} onClick={() => setSize(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 items-center">
            <span className="text-sm text-gray-600">Qty</span>
            <input type="number" className="input col-span-3" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="flex gap-2">
            {[1,2,3,5].map(n => (
              <button key={n} className={`px-3 py-2 rounded-xl text-sm font-semibold border ${qty===n ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 text-gray-700 border-gray-200'}`} onClick={() => setQty(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button action="given_away" label="Given Away" color="red" />
        <Button action="to_cleaners" label="Sent to Cleaners" color="orange" />
        <Button action="ordered" label="Ordered" color="blue" />
        <Button action="received" label="Received" color="green" />
      </div>
      {onClose && (
        <div className="flex justify-end">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      )}
    </div>
  );
}

export const SimplePad = memo(SimplePadImpl);


