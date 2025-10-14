import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getCallLogs } from '../../integrations/voiceflow';
import type { CallLog } from '../../integrations/voiceflow';
import { Phone, Clock, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react';

interface LogRow {
  id: string;
  created_at: string;
  actor: string | null;
  action: string;
  details: any;
}

export function LogsPanel() {
  const [activityLogs, setActivityLogs] = useState<LogRow[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'activity' | 'calls'>('activity');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      
      // Load activity logs
      const { data: activityData } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      setActivityLogs((activityData as LogRow[]) || []);

      // Load call logs
      try {
        const callData = await getCallLogs(50);
        setCallLogs(callData);
      } catch (error) {
        console.error('Failed to load call logs:', error);
        setCallLogs([]);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'initiated':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'initiated':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading"></div>
        <span className="ml-2 text-gray-600">Loading logs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity & Call Logs</h1>
          <p className="text-gray-600">Track system activity and order calls</p>
        </div>
        <button
          onClick={loadLogs}
          className="btn btn-secondary btn-sm"
        >
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'activity'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('activity')}
          >
            <Activity className="h-4 w-4 inline mr-2" />
            Activity Logs ({activityLogs.length})
          </button>
          <button
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'calls'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('calls')}
          >
            <Phone className="h-4 w-4 inline mr-2" />
            Call Logs ({callLogs.length})
          </button>
        </nav>
      </div>

      {/* Activity Logs Tab */}
      {activeTab === 'activity' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activityLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm text-gray-600">
                      <div>{new Date(log.created_at).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">{new Date(log.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="text-sm text-gray-600">{log.actor || 'System'}</td>
                    <td className="text-sm font-medium">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        log.action === 'low_stock_alert' ? 'bg-red-100 text-red-800' :
                        log.action === 'inventory_update' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="text-sm text-gray-600 max-w-xs">
                      <div className="truncate">
                        {log.details ? JSON.stringify(log.details) : 'No details'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {activityLogs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No activity logs found
            </div>
          )}
        </div>
      )}

      {/* Call Logs Tab */}
      {activeTab === 'calls' && (
        <div className="space-y-4">
          {/* Call Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Calls</p>
                  <p className="text-2xl font-bold text-gray-900">{callLogs.length}</p>
                </div>
                <Phone className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {callLogs.filter(c => c.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </div>
            
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Failed</p>
                  <p className="text-2xl font-bold text-red-600">
                    {callLogs.filter(c => c.status === 'failed').length}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Avg Duration</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {callLogs.filter(c => c.duration_seconds).length > 0 
                      ? formatDuration(
                          Math.round(
                            callLogs
                              .filter(c => c.duration_seconds)
                              .reduce((sum, c) => sum + (c.duration_seconds || 0), 0) /
                            callLogs.filter(c => c.duration_seconds).length
                          )
                        )
                      : 'N/A'
                    }
                  </p>
                </div>
                <Clock className="h-8 w-8 text-purple-500" />
              </div>
            </div>
          </div>

          {/* Call Logs Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Player</th>
                    <th>Edition</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Order Placed</th>
                    <th>Initiated By</th>
            </tr>
          </thead>
                <tbody>
                  {callLogs.map((call) => (
                    <tr key={call.id}>
                      <td className="text-sm text-gray-600">
                        <div>{call.created_at ? new Date(call.created_at).toLocaleDateString() : '-'}</div>
                        <div className="text-xs text-gray-500">{call.created_at ? new Date(call.created_at).toLocaleTimeString() : ''}</div>
                      </td>
                      <td className="font-medium">{call.player_name}</td>
                      <td className="text-sm text-gray-600">{call.edition}</td>
                      <td className="text-sm text-gray-600">{call.size}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(call.status)}
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(call.status)}`}>
                            {call.status}
                          </span>
                        </div>
                      </td>
                      <td className="text-sm text-gray-600">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          call.order_placed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {call.order_placed ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-600">{call.initiated_by || 'System'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
            
            {callLogs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No call logs found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


