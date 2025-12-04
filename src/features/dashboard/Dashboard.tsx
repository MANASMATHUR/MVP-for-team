import { useEffect, useState } from 'react';
import { supabase, getCurrentUserEmail } from '../../lib/supabaseClient';
import { Package, AlertTriangle, TrendingUp, CheckCircle, Users, Activity, Zap, Sparkles, Copy, Mail, ChevronDown } from 'lucide-react';
import { analyzeInventory, buildReorderEmailDraft, buildReorderEmailDraftAI } from '../../integrations/openai';
import { copyEmailToClipboard, openEmailClient } from '../../utils/emailUtils';
import toast from 'react-hot-toast';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { JerseyItem } from '../../types';
import { VoiceMic } from '../inventory/VoiceMic';

interface DashboardStats {
  totalJerseys: number;
  lowStockItems: number;
  totalValue: number;
  recentActivity: number;
  totalPlayers: number;
  avgStockPerPlayer: number;
  mostPopularEdition: string;
  efficiencyScore: number;
}

interface EditionData {
  edition: string;
  count: number;
  color: string;
}

// RecentCall type removed (recent calls feature not used in MVP)

function ReorderEmailButton() {
  const [emailData, setEmailData] = useState<{ subject: string; body: string; recipient: string; itemCount: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateEmailData = async () => {
    if (emailData) return emailData;

    setIsGenerating(true);
    try {
      const { data: settings } = await supabase.from('settings').select('low_stock_threshold, reorder_email_recipient').single();
      const threshold = settings?.low_stock_threshold ?? 1;
      const recipient = settings?.reorder_email_recipient;
      const { data: jerseys } = await supabase.from('jerseys').select('*');
      const lowStock = (jerseys || []).filter((j: any) => j.qty_inventory <= threshold);

      if (lowStock.length === 0) {
        toast.success('No low stock items to reorder');
        return null;
      }

      if (!recipient) {
        toast.error('Please configure reorder email recipient in Settings');
        return null;
      }

      const plainBlocks = lowStock.map((item: any) => buildReorderEmailDraft({
        player_name: item.player_name,
        edition: item.edition,
        size: item.size,
        qty_needed: Math.max(1, (threshold - item.qty_inventory) || 1)
      })).join('\n\n---\n\n');

      const polished = await buildReorderEmailDraftAI(plainBlocks);
      const subjectMatch = polished.match(/^Subject:\s*(.*)$/m);
      const subject = subjectMatch ? subjectMatch[1] : `Jersey Reorder Request - ${new Date().toLocaleDateString()}`;
      const body = polished.replace(/^Subject:.*\n?/, '');

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
      <button className="btn btn-primary" disabled>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        Generating...
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleDropdownClick}
        className="btn btn-primary flex items-center gap-2"
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

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalJerseys: 0,
    lowStockItems: 0,
    totalValue: 0,
    recentActivity: 0,
    totalPlayers: 0,
    avgStockPerPlayer: 0,
    mostPopularEdition: '',
    efficiencyScore: 0,
  });
  const [editionData, setEditionData] = useState<EditionData[]>([]);
  const [rows, setRows] = useState<JerseyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<{
    riskAssessment: string;
    recommendations: string[];
    suggestedActions: string[];
  } | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

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

  const updateRow = async (type: 'giveaway' | 'laundry' | 'receive', r: JerseyItem, qty = 1) => {
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
        .eq('id', r.id);
      if (error) throw error;
      setRows(prev => prev.map(row => row.id === r.id ? { ...row, ...fields } : row));
      if (type === 'giveaway') toast.success(`All set! Gave away ${qty} 🧾`);
      if (type === 'laundry') toast.success(`Sent ${qty} to laundry 🧺`);
      if (type === 'receive') toast.success(`Received ${qty} ✅`);
      return { success: true };
    } catch (e) {
      toast.error('😅 Whoops, try again?');
      return { success: false };
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const { data: jerseys } = await supabase
        .from('jerseys')
        .select('*');
      if (jerseys) {
        setRows(jerseys as JerseyItem[]);
        const totalJerseys = jerseys.length;
        const lowStockItems = jerseys.filter(j => j.qty_inventory <= 1).length;
        const totalValue = jerseys.reduce((sum, j) => sum + (j.qty_inventory * 75), 0);
        const uniquePlayers = new Set(jerseys.map(j => j.player_name)).size;
        const avgStockPerPlayer = totalJerseys / uniquePlayers;
        const editionCounts = jerseys.reduce((acc: Record<string, number>, jersey: any) => {
          acc[jersey.edition] = (acc[jersey.edition] || 0) + 1;
          return acc;
        }, {});
        const mostPopularEdition = Object.entries(editionCounts).reduce((a, b) =>
          editionCounts[a[0]] > editionCounts[b[0]] ? a : b
        )[0];
        const efficiencyScore = Math.round(
          Math.max(0, 100 - (lowStockItems / totalJerseys) * 100)
        );
        setStats({
          totalJerseys,
          lowStockItems,
          totalValue,
          recentActivity: 0,
          totalPlayers: uniquePlayers,
          avgStockPerPlayer: Math.round(avgStockPerPlayer * 10) / 10,
          mostPopularEdition,
          efficiencyScore,
        });
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
        const editionData = Object.entries(editionCounts).map(([edition, count], index) => ({
          edition,
          count: Number(count),
          color: colors[index % colors.length],
        }));
        setEditionData(editionData);
      }
      const { data: activityLogs } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setStats(prev => ({
        ...prev,
        recentActivity: activityLogs?.length || 0,
      }));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAiInsights = async () => {
    try {
      setAiLoading(true);
      setAiError(null);
      const analysis = await analyzeInventory();
      setAiInsights({
        riskAssessment: analysis.riskAssessment,
        recommendations: analysis.recommendations.slice(0, 4),
        suggestedActions: analysis.suggestedActions.slice(0, 4),
      });
    } catch (e: any) {
      setAiError('AI insights unavailable right now');
    } finally {
      setAiLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: {
    title: string;
    value: string | number;
    icon: any;
    color: string;
    subtitle?: string;
  }) => (
    <div className="card p-6 transition-transform hover:-translate-y-0.5 stat-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-blue-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Loading Dashboard</p>
          <p className="text-sm text-gray-500">Analyzing inventory data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="gradient-header flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Overview of your inventory management system</p>
        </div>
        <button
          onClick={loadDashboardData}
          className="btn btn-secondary btn-sm"
        >
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Jerseys"
          value={stats.totalJerseys}
          icon={Package}
          color="bg-blue-500"
          subtitle="All jersey variants"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockItems}
          icon={AlertTriangle}
          color="bg-red-500"
          subtitle="Need reordering"
        />
        <StatCard
          title="Inventory Value"
          value={`$${stats.totalValue.toLocaleString()}`}
          icon={TrendingUp}
          color="bg-green-500"
          subtitle="Estimated total value"
        />
        <StatCard
          title="Efficiency Score"
          value={`${stats.efficiencyScore}%`
          }
          icon={Zap}
          color="bg-purple-500"
          subtitle="Stock optimization"
        />
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Active Players"
          value={stats.totalPlayers}
          icon={Users}
          color="bg-indigo-500"
          subtitle="Unique players tracked"
        />
        <StatCard
          title="Avg Stock/Player"
          value={stats.avgStockPerPlayer}
          icon={Activity}
          color="bg-cyan-500"
          subtitle="Average inventory per player"
        />
        <StatCard
          title="Popular Edition"
          value={stats.mostPopularEdition}
          icon={CheckCircle}
          color="bg-emerald-500"
          subtitle="Most stocked edition"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edition Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Jersey Distribution by Edition</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={editionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ edition, count }) => `${edition}: ${count}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {editionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recommendations Panel */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> Recommendations
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={loadAiInsights} disabled={aiLoading}>
              {aiLoading ? 'Analyzing...' : 'Refresh'}
            </button>
          </div>
          {aiError && (
            <div className="text-sm text-red-600 mb-2">{aiError}</div>
          )}
          {aiInsights ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Risk Assessment</div>
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  {aiInsights.riskAssessment}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Recommendations</div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                  {aiInsights.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Suggested Actions</div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                  {aiInsights.suggestedActions.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Click "Refresh" to analyze your latest inventory.</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReorderEmailButton />
          <button
            className="btn btn-secondary"
            onClick={async () => {
              try {
                const player = window.prompt('Player name?');
                if (!player) return;
                const edition = window.prompt('Edition (Icon/Statement/Association/City)?', 'Icon') || 'Icon';
                const size = window.prompt('Size?', '48') || '48';
                const inv = parseInt(window.prompt('Inventory qty?', '0') || '0', 10) || 0;
                const lva = parseInt(window.prompt('Due to LVA qty?', '0') || '0', 10) || 0;
                const updatedBy = await getCurrentUserEmail();
                const { error } = await supabase
                  .from('jerseys')
                  .insert({
                    player_name: player.trim(),
                    edition: edition as any,
                    size: size.trim(),
                    qty_inventory: Math.max(0, inv),
                    qty_due_lva: Math.max(0, lva),
                    updated_by: updatedBy,
                    updated_at: new Date().toISOString(),
                  });
                if (error) throw new Error(error.message);
                toast.success('Jersey added');
                loadDashboardData();
              } catch (e: any) {
                console.error('Quick add error:', e);
                toast.error(e?.message || 'Failed to add jersey');
              }
            }}
            title="Quick add a jersey"
          >
            <Package className="h-4 w-4" />
            Add New Jersey
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              try {
                toast.loading('Generating report...', { id: 'qa-report' });
                const { data: jerseys } = await supabase.from('jerseys').select('*');
                const total = jerseys?.length || 0;
                const low = jerseys?.filter((j: any) => j.qty_inventory <= 1).length || 0;
                const value = jerseys?.reduce((sum: number, j: any) => sum + (j.qty_inventory * 75), 0) || 0;
                const editions = (jerseys || []).reduce((acc: Record<string, number>, j: any) => { acc[j.edition] = (acc[j.edition] || 0) + 1; return acc; }, {} as Record<string, number>);
                const lines = [
                  '# Monthly Inventory Report',
                  '',
                  '## Summary',
                  `- Total jerseys in inventory: ${total}`,
                  `- Low stock items: ${low}`,
                  `- Total inventory value: $${value.toLocaleString()}`,
                  '',
                  '## Edition Breakdown',
                  ...Object.entries(editions).map(([ed, count]) => `- ${ed}: ${count}`),
                  '',
                  '## Recommendations',
                  '- Review low stock items and place reorders',
                  '- Analyze usage patterns to optimize stock levels',
                  '- Consider seasonal variations in demand',
                ].join('\n');
                await navigator.clipboard.writeText(lines);
                toast.success('Report copied to clipboard', { id: 'qa-report' });
              } catch (e) {
                console.error('Quick report error:', e);
                toast.error('Failed to generate report', { id: 'qa-report' });
              }
            }}
            title="Copy monthly report to clipboard"
          >
            <CheckCircle className="h-4 w-4" />
            Copy Report
          </button>
        </div>
      </div>

      {/* Large Centered MIC Dock */}
      <div className="mic-dock safe-area-bottom pointer-events-none">
        <div className="w-full max-w-xl mx-auto px-4">
          <div
            className="pointer-events-auto rounded-full bg-white/75 backdrop-blur ring-1 ring-blue-300 border border-blue-100 flex justify-center items-center py-3 shadow-2xl"
            style={{ boxShadow: '0 10px 28px rgba(24,102,255,0.18),0 4px 24px rgba(65,0,150,0.14)' }}
          >
            <VoiceMic
              rows={rows}
              onAction={async (command) => {
                let type: 'giveaway' | 'laundry' | 'receive' | undefined;
                let q = 1;
                if (command.type === 'turn_in' || command.type === 'remove' || command.type === 'delete') type = 'giveaway';
                if (command.type === 'laundry_return') type = 'receive';
                if (command.type === 'add') type = 'receive';
                if (command.type === 'set' || command.type === 'order') type = undefined;
                q = Number(command.quantity || command.target_quantity || 1);
                const target = resolveTarget(command as any);
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
