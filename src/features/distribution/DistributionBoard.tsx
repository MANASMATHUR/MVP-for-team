import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Users, Package, TrendingUp } from 'lucide-react';

interface DistributionRecord {
  recipient: string;
  totalJerseys: number;
  breakdown: Array<{
    player_name: string;
    edition: string;
    size: string;
    quantity: number;
    date: string;
  }>;
}

export function DistributionBoard() {
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    loadDistributionData();
  }, [dateRange]);

  const loadDistributionData = async () => {
    try {
      setLoading(true);
      
      // Calculate date filter
      let dateFilter = '';
      const now = new Date();
      switch (dateRange) {
        case '7d':
          dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case '30d':
          dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case '90d':
          dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          dateFilter = '';
      }

      // Load giveaway activity logs
      let query = supabase
        .from('activity_logs')
        .select('*')
        .eq('action', 'giveaway')
        .order('created_at', { ascending: false });

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data: logs } = await query;

      if (!logs) {
        setDistributions([]);
        return;
      }

      // Group by recipient
      const grouped = logs.reduce((acc: Record<string, DistributionRecord>, log: any) => {
        const recipient = log.details?.recipient || 'Unknown';
        if (!acc[recipient]) {
          acc[recipient] = {
            recipient,
            totalJerseys: 0,
            breakdown: []
          };
        }
        
        acc[recipient].totalJerseys += log.details?.quantity || 0;
        acc[recipient].breakdown.push({
          player_name: log.details?.player_name || 'Unknown',
          edition: log.details?.edition || 'Unknown',
          size: log.details?.size || 'Unknown',
          quantity: log.details?.quantity || 0,
          date: log.created_at
        });

        return acc;
      }, {});

      // Sort by total jerseys descending
      const sortedDistributions = Object.values(grouped)
        .sort((a, b) => b.totalJerseys - a.totalJerseys);

      setDistributions(sortedDistributions);
    } catch (error) {
      console.error('Failed to load distribution data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalJerseys = () => {
    return distributions.reduce((sum, dist) => sum + dist.totalJerseys, 0);
  };

  const getUniqueRecipients = () => {
    return distributions.length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading"></div>
        <span className="ml-2 text-gray-600">Loading distribution data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jersey Distribution Board</h1>
          <p className="text-gray-600">Track jersey giveaways by recipient</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="select select-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={loadDistributionData}
            className="btn btn-secondary btn-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Recipients</p>
              <p className="text-2xl font-bold text-blue-600">{getUniqueRecipients()}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Jerseys Given</p>
              <p className="text-2xl font-bold text-green-600">{getTotalJerseys()}</p>
            </div>
            <Package className="h-8 w-8 text-green-500" />
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg per Recipient</p>
              <p className="text-2xl font-bold text-purple-600">
                {getUniqueRecipients() > 0 ? Math.round(getTotalJerseys() / getUniqueRecipients() * 10) / 10 : 0}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Distribution List */}
      <div className="card overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Distribution by Recipient</h3>
        </div>
        
        {distributions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No jersey distributions found for the selected period
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {distributions.map((dist, index) => (
              <div key={dist.recipient} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-lg">
                        {dist.recipient.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">{dist.recipient}</h4>
                      <p className="text-sm text-gray-600">
                        #{index + 1} recipient • {dist.totalJerseys} jerseys total
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{dist.totalJerseys}</div>
                    <div className="text-sm text-gray-600">jerseys</div>
                  </div>
                </div>
                
                {/* Breakdown */}
                <div className="ml-13">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dist.breakdown.map((item, itemIndex) => (
                      <div key={itemIndex} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.player_name} {item.edition}
                            </p>
                            <p className="text-sm text-gray-600">Size {item.size}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-blue-600">
                              {item.quantity}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(item.date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
