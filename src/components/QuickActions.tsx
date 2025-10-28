import { useMemo, useState, memo } from 'react';
import type { JerseyItem, JerseyEdition } from '../types';

type ActionType = 'given_away' | 'to_cleaners' | 'ordered' | 'received';

interface QuickActionsProps {
  rows: JerseyItem[];
  onApply: (action: ActionType, args: { player_name: string; edition: JerseyEdition; size: string; quantity: number }) => Promise<void>;
}

function QuickActionsImpl({ rows, onApply }: QuickActionsProps) {
  const [open, setOpen] = useState<ActionType | null>(null);
  const [player, setPlayer] = useState('');
  const [edition, setEdition] = useState<JerseyEdition>('Icon');
  const [size, setSize] = useState('48');
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const players = useMemo(() => Array.from(new Set(rows.map(r => r.player_name))).sort(), [rows]);
  const editions = useMemo(() => Array.from(new Set(rows.filter(r => !player || r.player_name === player).map(r => r.edition))), [rows, player]);
  const sizes = useMemo(() => Array.from(new Set(rows.filter(r => (!player || r.player_name === player) && (!edition || r.edition === edition)).map(r => r.size))).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)), [rows, player, edition]);

  const reset = () => {
    setQty(1);
  };

  const submit = async () => {
    if (!open) return;
    const selectedPlayer = player || (players[0] || '');
    const selectedEdition = (edition || (editions[0] as JerseyEdition)) || 'Icon';
    const selectedSize = size || (sizes[0] || '48');
    if (!selectedPlayer) {
      setOpen(null);
      return;
    }
    setLoading(true);
    try {
      await onApply(open, { player_name: selectedPlayer, edition: selectedEdition as JerseyEdition, size: selectedSize, quantity: Math.max(1, qty || 1) });
      setOpen(null);
      reset();
    } finally {
      setLoading(false);
    }
  };

  const ActionButton = ({ type, label, color }: { type: ActionType; label: string; color: 'red' | 'orange' | 'blue' | 'green' }) => (
    <button
      className={`flex-1 min-w-[160px] px-5 py-4 rounded-2xl text-base font-bold border shadow-sm transition-all active:scale-[0.99]
        ${color === 'red' ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100' : ''}
        ${color === 'orange' ? 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100' : ''}
        ${color === 'blue' ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' : ''}
        ${color === 'green' ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' : ''}
      `}
      onClick={() => setOpen(type)}
    >
      {label}
    </button>
  );

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3">
        <ActionButton type="given_away" label="Given Away" color="red" />
        <ActionButton type="to_cleaners" label="Sent to Cleaners" color="orange" />
        <ActionButton type="ordered" label="Ordered" color="blue" />
        <ActionButton type="received" label="Received" color="green" />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30">
          <div className="card w-full sm:max-w-md p-6 m-0 sm:m-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {open === 'given_away' && 'Record Giveaway'}
                {open === 'to_cleaners' && 'Send to Laundry'}
                {open === 'ordered' && 'Record Order Placed'}
                {open === 'received' && 'Record Items Received'}
              </h3>
              <button className="text-gray-500" onClick={() => setOpen(null)}>✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Player</label>
                <select className="input w-full" value={player} onChange={(e) => setPlayer(e.target.value)}>
                  <option value="">Select player</option>
                  {players.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Edition</label>
                  <select className="input w-full" value={edition} onChange={(e) => setEdition(e.target.value as JerseyEdition)}>
                    {['Icon','Statement','Association','City'].map(ed => (
                      <option key={ed} value={ed}>{ed}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Size</label>
                  <select className="input w-full" value={size} onChange={(e) => setSize(e.target.value)}>
                    <option value="48">48</option>
                    {sizes.filter(s => s !== '48').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Quantity</label>
                <input type="number" className="input w-full" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const QuickActions = memo(QuickActionsImpl);


