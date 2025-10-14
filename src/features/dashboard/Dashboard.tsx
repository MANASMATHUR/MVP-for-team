import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Package, AlertTriangle, TrendingUp, Phone, Clock, CheckCircle } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalJerseys: number;
  lowStockItems: number;
  totalValue: number;
  recentActivity: number;
}

interface EditionData {
  edition: string;
  count: number;
  color: string;
}

interface RecentCall {
  id: string;
  player_name: string;
  edition: string;
  size: string;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
  duration?: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalJerseys: 0,
    lowStockItems: 0,
    totalValue: 0,
    recentActivity: 0,
  });
  const [editionData, setEditionData] = useState<EditionData[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
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
        
        setStats({
          totalJerseys,
          lowStockItems,
          totalValue,
          recentActivity: 0, // Will be updated with activity logs
        });

        // Calculate edition distribution
        const editionCounts: Record<string, number> = jerseys.reduce((acc: Record<string, number>, jersey: any) => {
          acc[jersey.edition] = (acc[jersey.edition] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
        const editionData = Object.entries(editionCounts).map(([edition, count], index) => ({
          edition,
          count: Number(count),
          color: colors[index % colors.length],
        }));

        setEditionData(editionData);
      }

      // Load recent calls (mock data for now)
      const mockCalls: RecentCall[] = [
        {
          id: '1',
          player_name: 'Jalen Green',
          edition: 'Icon',
          size: '48',
          status: 'completed',
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          duration: 180,
        },
        {
          id: '2',
          player_name: 'Alperen Sengun',
          edition: 'Statement',
          size: '52',
          status: 'pending',
          created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          player_name: 'Fred VanVleet',
          edition: 'City',
          size: '50',
          status: 'completed',
          created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          duration: 240,
        },
      ];

      setRecentCalls(mockCalls);

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
      <div className="flex items-center justify-center h-64">
        <div className="loading"></div>
        <span className="ml-2 text-gray-600">Loading dashboard...</span>
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
          title="Recent Activity"
          value={stats.recentActivity}
          icon={Clock}
          color="bg-purple-500"
          subtitle="Last 24 hours"
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

        {/* Recent Calls */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Order Calls</h3>
          <div className="space-y-3">
            {recentCalls.map((call) => (
              <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    call.status === 'completed' ? 'bg-green-100' :
                    call.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <Phone className={`h-4 w-4 ${
                      call.status === 'completed' ? 'text-green-600' :
                      call.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{call.player_name}</p>
                    <p className="text-sm text-gray-600">{call.edition} - Size {call.size}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    call.status === 'completed' ? 'bg-green-100 text-green-800' :
                    call.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {call.status}
                  </div>
                  {call.duration && (
                    <p className="text-xs text-gray-500 mt-1">{Math.floor(call.duration / 60)}m {call.duration % 60}s</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
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
          <button className="btn btn-secondary">
            <CheckCircle className="h-4 w-4" />
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}
