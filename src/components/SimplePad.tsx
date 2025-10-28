import { useEffect, useMemo, useState, memo } from 'react';
import type { JerseyItem, JerseyEdition } from '../types';

type ActionType = 'given_away' | 'to_cleaners' | 'ordered' | 'received';

interface SimplePadProps {
  rows: JerseyItem[];
  onApply: (action: ActionType, args: { player_name: string; edition: JerseyEdition; size: string; quantity: number }) => Promise<void>;
  presetPlayer?: string;
  onClose?: () => void;
}

function SimplePadImpl({ rows, onApply, presetPlayer, onClose }: SimplePadProps) {
  const players = useMemo(() => Array.from(new Set(rows.map(r => r.player_name))).sort(), [rows]);
  const [query, setQuery] = useState(presetPlayer || '');
  const [player, setPlayer] = useState(presetPlayer || '');
  const [edition, setEdition] = useState<JerseyEdition>('Icon');
  const [size, setSize] = useState('48');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState<ActionType | null>(null);

  useEffect(() => {
    // Auto-complete player from query
    if (!query) return;
    const match = players.find(p => p.toLowerCase().includes(query.toLowerCase()));
    if (match) setPlayer(match);
  }, [query, players]);

  const apply = async (action: ActionType) => {
    if (!player) return;
    setLoading(action);
    try {
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
          <div className="grid grid-cols-3 gap-3">
            {presetPlayer ? (
              <input className="input" value={player} readOnly />
            ) : (
              <select className="input" value={player} onChange={(e) => setPlayer(e.target.value)}>
                <option value="">Player</option>
                {players.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <select className="input" value={edition} onChange={(e) => setEdition(e.target.value as JerseyEdition)}>
              {['Icon','Statement','Association','City'].map(ed => <option key={ed} value={ed}>{ed}</option>)}
            </select>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
              {['46','48','50','52','54','56','58','60'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-3 items-center">
            <span className="text-sm text-gray-600">Qty</span>
            <input type="number" className="input col-span-3" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
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


