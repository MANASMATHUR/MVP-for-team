import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { JerseyItem } from '../../types';
import toast from 'react-hot-toast';
import { VoiceMic } from '../inventory/VoiceMic';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CalendarDays, ChevronRight, Clock3, MapPin, Package2 } from 'lucide-react';
  const statusLabel = (status: 'ready' | 'low' | 'empty') => {
    if (status === 'ready') return 'Ready';
    if (status === 'low') return 'Low';
    return 'Empty';
  };


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

  const rosterSummary = useMemo(() => {
    const totalPlayers = players.length;
    const fullyReady = players.filter(p => p.ready === p.total && p.total > 0).length;
    const jerseysDueLaundry = rows.reduce((sum, r) => sum + (r.qty_due_lva ?? 0), 0);
    const lowStockStyles = rows.filter(r => r.qty_inventory <= 1).length;
    return { totalPlayers, fullyReady, jerseysDueLaundry, lowStockStyles };
  }, [players, rows]);

  const quickMicPrompts = useMemo(
    () => [
      '“How many jerseys are ready for Alperen?”',
      '“Send two Icon jerseys for Dillon to laundry.”',
      '“Mark Jalen’s Statement jerseys as received.”',
      '“Who is low on Association editions?”',
    ],
    []
  );

  const playerCards = useMemo(() => {
    return players.map(player => {
      const playerRows = rows.filter(r => r.player_name === player.name);
      const styles = playerRows.length;
      const onHand = playerRows.reduce((sum, r) => sum + (r.qty_inventory ?? 0), 0);
      const low = playerRows.some(r => r.qty_inventory <= 1);
      const hasInventory = onHand > 0;
      const status: 'ready' | 'low' | 'empty' = low ? 'low' : hasInventory ? 'ready' : 'empty';
      const numberMatch = player.name.match(/\d+/);
      const avatar = numberMatch ? numberMatch[0] : player.name.slice(0, 2).toUpperCase();
      return {
        ...player,
        styles,
        onHand,
        status,
        avatar,
      };
    });
  }, [players, rows]);

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

  const updateRow = async (type: 'giveaway' | 'laundry' | 'receive', r: typeof rows[0], qty = 1): Promise<{ success: boolean }> => {
    if (!r) return { success: false };
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
      const { error } = await supabase
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
      return { success: true };
    } catch (e) {
      toast.error('Error updating inventory.');
      return { success: false };
    }
  };

  const scrollToMic = useCallback(() => {
    const micButton = document.querySelector<HTMLButtonElement>('.mic-dock button');
    if (micButton) {
      micButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      micButton.focus({ preventScroll: true });
    }
  }, []);

  return (
    <div className="roster-screen pt-3 pb-28">
      <div className="roster-hero mx-3 mb-4">
        <div className="roster-hero__main">
          <div className="roster-hero__label">Next Game</div>
          <h2 className="roster-hero__headline">vs Los Angeles Lakers</h2>
          <div className="roster-hero__meta">
            <span className="roster-hero__meta-pill">
              <CalendarDays className="roster-hero__icon" />
              Mon, Nov 3
            </span>
            <span className="roster-hero__meta-pill">
              <Clock3 className="roster-hero__icon" />
              19:30
            </span>
            <span className="roster-hero__meta-pill">
              <MapPin className="roster-hero__icon" />
              Toyota Center
            </span>
            <span className="roster-hero__badge">Home</span>
          </div>
        </div>
        <div className="roster-hero__snapshot">
          <div className="roster-hero__snapshot-label">Locker room snapshot</div>
          <div className="roster-hero__snapshot-metric">
            <span className="roster-hero__snapshot-number">{rosterSummary.fullyReady}</span>
            <span className="roster-hero__snapshot-text">Players ready</span>
            <span className="roster-hero__snapshot-total">/ {rosterSummary.totalPlayers}</span>
          </div>
          <div className="roster-hero__snapshot-chips">
            <span className="roster-hero__chip roster-hero__chip--green">
              {rosterSummary.jerseysDueLaundry} awaiting laundry
            </span>
            <span className="roster-hero__chip roster-hero__chip--yellow">
              {rosterSummary.lowStockStyles} styles low
            </span>
          </div>
          <div className="roster-hero__mic-hints">
            {quickMicPrompts.slice(0, 2).map(prompt => (
              <span key={prompt} className="roster-hero__mic-chip">
                🎙 {prompt}
              </span>
            ))}
            <button type="button" onClick={scrollToMic} className="roster-hero__mic-button">
              Open mic
            </button>
          </div>
        </div>
      </div>

      <div className="roster-critical mx-3 mb-4">
        <div className="roster-critical__content">
          <span className="roster-critical__label">Critical</span>
          <p className="roster-critical__text">Players need jerseys</p>
        </div>
        <div className="roster-critical__metric">
          <span>{rosterSummary.fullyReady}</span>
          <small>/ {rosterSummary.totalPlayers}</small>
        </div>
      </div>

      <div className="roster-section-heading px-4">Team Roster</div>
      <div className="roster-list px-3 pb-8">
        {playerCards.map(card => (
          <button
            key={card.name}
            className="roster-player-card"
            onClick={() => setActivePlayer(card.name)}
            aria-label={`Open details for ${card.name}`}
          >
            <div className="roster-player-card__left">
              <span className="roster-player-avatar">{card.avatar}</span>
              <div className="roster-player-body">
                <p className="roster-player-name">{card.name}</p>
                <span className="roster-player-meta">
                  <span className="roster-player-meta__item">
                    <Package2 className="roster-player-meta__icon" />
                    {card.styles} styles
                  </span>
                  <span className="roster-player-meta__divider">•</span>
                  <span className="roster-player-meta__item">{card.onHand} home</span>
                </span>
              </div>
            </div>
            <div className="roster-player-card__right">
              <div className={`roster-player-status roster-player-status--${card.status}`} title={statusLabel(card.status)}>
                <span />
              </div>
              <ChevronRight className="roster-player-chevron" />
            </div>
          </button>
        ))}
      </div>
      <Sheet open={!!activePlayer} onOpenChange={(open) => !open && setActivePlayer(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] sm:max-h-[90vh] flex flex-col p-0 gap-0">
          <SheetHeader className="px-4 sm:px-6 py-4 bg-gray-900 text-white border-b border-gray-800">
            <SheetTitle className="text-left text-base sm:text-lg font-extrabold">{activePlayer}</SheetTitle>
            <SheetDescription className="text-left text-sm sm:text-base text-gray-400 mt-1">
              {activePlayer && rows.filter(r => r.player_name === activePlayer).length} Jersey Styles
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 sm:space-y-6 px-3 sm:px-4 pb-4 sm:pb-6 overflow-y-auto flex-1 min-h-0 pt-4">
              {rows.filter(r => r.player_name === activePlayer).map((r, idx) => {
                const locker = r.qty_locker ?? 0;
                const closet = r.qty_closet ?? 0;
                const laundry = r.qty_due_lva ?? 0;
                const inventory = r.qty_inventory ?? 0;
                const projected = inventory + closet + laundry;
                const minRequired = Math.max(1, locker || closet || 1);
                const status: 'ready' | 'low' | 'empty' =
                  inventory <= 0 ? 'empty' : inventory <= 1 ? 'low' : 'ready';
                const qtyOptions = [1, 2, 3, 5];
                const prompts = quickMicPrompts.slice(0, 3);
                return (
                <div key={r.id || idx} className="roster-sheet-card">
                  <div className="roster-sheet-card__header">
                    <div>
                      <p className="roster-sheet-card__title">{r.edition} Edition</p>
                      <p className="roster-sheet-card__subtitle">
                        {r.size ? `Size ${r.size}` : 'Standard fit'} • {inventory} on hand
                      </p>
                    </div>
                    <div className={`roster-player-status roster-player-status--${status}`} title={statusLabel(status)}>
                      <span />
                    </div>
                  </div>
                  <div className="roster-sheet-card__meta">
                    <span>
                      Min Required: <strong>{minRequired}</strong>
                    </span>
                    <span>
                      Projected: <strong>{projected}</strong>
                    </span>
                  </div>
                  <div className="roster-sheet-card__grid">
                    <div className="roster-sheet-card__grid-item">
                      <span>Locker</span>
                      <strong>{locker} / 3</strong>
                    </div>
                    <div className="roster-sheet-card__grid-item">
                      <span>Closet</span>
                      <strong>{closet} / 5</strong>
                    </div>
                    <div className="roster-sheet-card__grid-item">
                      <span>Laundry</span>
                      <strong>{laundry}</strong>
                    </div>
                    <div className="roster-sheet-card__grid-item">
                      <span>In Transit</span>
                      <strong>0</strong>
                    </div>
                  </div>
                  <div className="roster-sheet-card__qty-row">
                    <div className="roster-sheet-card__qty">
                      <span className="roster-sheet-card__qty-label">Qty</span>
                      <input
                        type="number"
                        min={1}
                        max={inventory || 100}
                        value={qty}
                        onChange={e => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                        className="roster-sheet-card__qty-input"
                        style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                      />
                      {qtyOptions.map(n => (
                        <button
                          key={n}
                          type="button"
                          className={`roster-sheet-card__qty-chip ${qty === n ? 'is-active' : ''}`}
                          onClick={() => setQty(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="roster-sheet-card__voice">
                      <VoiceMic
                        rows={[r]}
                        onAction={async (command) => {
                          let type: 'giveaway'|'laundry'|'receive'|undefined, q = 1;
                          if (command.type === 'turn_in' || command.type === 'remove' || command.type === 'delete') type = 'giveaway';
                          if (command.type === 'laundry_return') type = 'receive';
                          if (command.type === 'add') type = 'receive';
                          if (command.type === 'set' || command.type === 'order') type = undefined;
                          q = Number(command.quantity || command.target_quantity || qty || 1);
                          if (!type) return { success: false };
                          return await updateRow(type, r, q);
                        }}
                      />
                    </div>
                  </div>
                  <div className="roster-sheet-card__prompts">
                    <span className="roster-sheet-card__prompts-label">Try saying</span>
                    <div className="roster-sheet-card__prompts-chips">
                      {prompts.map(prompt => (
                        <span key={prompt} className="roster-sheet-card__prompt-chip">
                          {prompt.replace(/(^“|”$)/g, '')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="roster-sheet-card__actions">
                    <button
                      type="button"
                      className="roster-sheet-card__action roster-sheet-card__action--give"
                      onClick={() => updateRow('giveaway', r, qty)}
                    >
                      Give Away
                    </button>
                    <button
                      type="button"
                      className="roster-sheet-card__action roster-sheet-card__action--laundry"
                      onClick={() => updateRow('laundry', r, qty)}
                    >
                      To Laundry
                    </button>
                    <button
                      type="button"
                      className="roster-sheet-card__action roster-sheet-card__action--receive"
                      onClick={() => updateRow('receive', r, qty)}
                    >
                      Receive
                    </button>
                  </div>
                </div>
              )})}
          </div>
        </SheetContent>
      </Sheet>
      <div className="mic-dock safe-area-bottom pointer-events-none">
        <div className="w-full max-w-xl mx-auto">
          <div className="pointer-events-auto rounded-full bg-white/70 backdrop-blur ring-1 ring-blue-300 border border-blue-100 flex justify-center items-center py-3 shadow-2xl" style={{boxShadow:'0 10px 28px rgba(24,102,255,0.18),0 4px 24px rgba(65,0,150,0.14)'}}>
            <VoiceMic
              rows={rows}
              onAction={async (command) => {
                let type: 'giveaway'|'laundry'|'receive'|undefined, q = 1;
                if (command.type === 'turn_in' || command.type === 'remove' || command.type === 'delete') type = 'giveaway';
                if (command.type === 'laundry_return') type = 'receive';
                if (command.type === 'add') type = 'receive';
                if (command.type === 'set' || command.type === 'order') type = undefined;
                q = Number(command.quantity || command.target_quantity || 1);
                const target = resolveTarget(command);
                if (!type || !target) return { success: false };
                return await updateRow(type, target, q);
              }}
              large={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


