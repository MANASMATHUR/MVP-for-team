import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Package, AlertTriangle, TrendingUp, Phone, CheckCircle, Users, Activity, Zap } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load jersey statistics
      const { data: jerseys } = await supabase
        .from('jerseys')
        .select('*');

      if (jerseys) {
        const totalJerseys = jerseys.length;
        const lowStockItems = jerseys.filter(j => j.qty_inventory <= 1).length;
        const totalValue = jerseys.reduce((sum, j) => sum + (j.qty_inventory * 75), 0); // Assuming $75 per jersey
        
        // Calculate additional stats
        const uniquePlayers = new Set(jerseys.map(j => j.player_name)).size;
        const avgStockPerPlayer = totalJerseys / uniquePlayers;
        
        // Find most popular edition
        const editionCounts = jerseys.reduce((acc: Record<string, number>, jersey: any) => {
          acc[jersey.edition] = (acc[jersey.edition] || 0) + 1;
          return acc;
        }, {});
        const mostPopularEdition = Object.entries(editionCounts).reduce((a, b) => 
          editionCounts[a[0]] > editionCounts[b[0]] ? a : b
        )[0];
        
        // Calculate efficiency score (0-100)
        const efficiencyScore = Math.round(
          Math.max(0, 100 - (lowStockItems / totalJerseys) * 100)
        );
        
        setStats({
          totalJerseys,
          lowStockItems,
          totalValue,
          recentActivity: 0, // Will be updated with activity logs
          totalPlayers: uniquePlayers,
          avgStockPerPlayer: Math.round(avgStockPerPlayer * 10) / 10,
          mostPopularEdition,
          efficiencyScore,
        });

        // Calculate edition distribution (reuse the counts we already calculated)

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
        const editionData = Object.entries(editionCounts).map(([edition, count], index) => ({
          edition,
          count: Number(count),
          color: colors[index % colors.length],
        }));

        setEditionData(editionData);
      }

      // Recent calls removed for enterprise build

      // Load recent activity
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

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: {
    title: string;
    value: string | number;
    icon: any;
    color: string;
    subtitle?: string;
  }) => (
    <div className="card p-6 transition-transform hover:-translate-y-0.5">
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
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-blue-400 rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Loading Dashboard</p>
          <p className="text-sm text-gray-500">Analyzing inventory data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          value={`${stats.efficiencyScore}%`}
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

        {/* Recent Calls removed for enterprise build */}
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn btn-primary">
            <Phone className="h-4 w-4" />
            Place Order Call
          </button>
          <button className="btn btn-secondary">
            <Package className="h-4 w-4" />
            Add New Jersey
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              try {
                // Local report generation without external APIs
                const { data: jerseys } = await supabase.from('jerseys').select('*');
                const total = jerseys?.length || 0;
                const low = jerseys?.filter((j: any) => j.qty_inventory <= 1).length || 0;
                const value = jerseys?.reduce((sum: number, j: any) => sum + (j.qty_inventory * 75), 0) || 0;
                const editions = (jerseys || []).reduce((acc: Record<string, number>, j: any) => { acc[j.edition] = (acc[j.edition] || 0) + 1; return acc; }, {});
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
                alert('Inventory report copied to clipboard');
              } catch (e) {
                console.error('Report generation error:', e);
                alert('Failed to generate report');
              }
            }}
          >
            <CheckCircle className="h-4 w-4" />
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}
