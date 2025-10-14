import { supabase } from '../lib/supabaseClient';

export interface VoiceCommandResult {
  type: 'adjust' | 'order' | 'giveaway' | 'unknown' | 'set' | 'delete';
  player_name?: string;
  edition?: string;
  qty_inventory_delta?: number;
  qty_due_lva_delta?: number;
  size?: string;
  order_quantity?: number;
  giveaway_quantity?: number;
  recipient?: string;
  set_inventory_to?: number;
  order_details?: {
    supplier?: string;
    priority?: 'high' | 'medium' | 'low';
    notes?: string;
  };
}

export interface CallLog {
  id: string;
  player_name: string;
  edition: string;
  size: string;
  status: 'initiated' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  created_at?: string;
  duration_seconds?: number;
  voiceflow_session_id?: string;
  transcript?: string;
  order_placed: boolean;
  order_details?: any;
  error_message?: string;
  initiated_by?: string;
}

export async function interpretVoiceCommand(transcript: string): Promise<VoiceCommandResult> {
  const apiUrl = import.meta.env.VITE_VOICEFLOW_API_URL as string | undefined;
  const apiKey = import.meta.env.VITE_VOICEFLOW_API_KEY as string | undefined;
  
  if (!apiUrl || !apiKey) {
    // Fallback to local interpretation if Voiceflow is not configured
    return interpretVoiceCommandLocal(transcript);
  }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ 
        transcript,
        context: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        }
      }),
    });
    
    if (!res.ok) {
      console.warn('Voiceflow API failed, falling back to local interpretation');
      return interpretVoiceCommandLocal(transcript);
    }
    
    const result = await res.json();
    return result as VoiceCommandResult;
  } catch (error) {
    console.error('Voiceflow API error:', error);
    return interpretVoiceCommandLocal(transcript);
  }
}

export function interpretVoiceCommandLocal(transcript: string): VoiceCommandResult {
  const lowerTranscript = transcript.toLowerCase();
  const normalizeEdition = (s?: string) => {
    if (!s) return s;
    const singular = s.replace(/s\b/, ''); // tolerate plural 'statements'
    if (/(icon)/.test(singular)) return 'Icon';
    if (/(statement)/.test(singular)) return 'Statement';
    if (/(association)/.test(singular)) return 'Association';
    if (/(city)/.test(singular)) return 'City';
    return undefined;
  };
  
  // Check for giveaway/donation style commands
  if (
    lowerTranscript.includes('gave away') ||
    lowerTranscript.includes('give away') ||
    lowerTranscript.includes('donated') ||
    lowerTranscript.includes('donate') ||
    lowerTranscript.includes('handed out') ||
    lowerTranscript.includes('hand out') ||
    lowerTranscript.includes('gave ')
  ) {
    const editionMatch = lowerTranscript.match(/\b(icon|statement|association|city)\b/);
    const sizeMatch = lowerTranscript.match(/size\s+(\d+)/);
    const qtyMatch = lowerTranscript.match(/(\d+)\s*(?:jerseys?|pieces?)?/);
    const recipientMatch = transcript.match(/\bto\s+(.+?)$/i);

    const recipient = (recipientMatch?.[1] || '').trim().replace(/[.!?]$/, '');

    return {
      type: 'giveaway',
      edition: editionMatch?.[1] || 'Icon',
      size: sizeMatch?.[1] || '48',
      giveaway_quantity: parseInt(qtyMatch?.[1] || '1', 10),
      recipient,
      // player_name intentionally optional for giveaway
    };
  }

  // Check for order commands
  if (lowerTranscript.includes('order') || lowerTranscript.includes('reorder') || lowerTranscript.includes('buy')) {
    const playerMatch = lowerTranscript.match(/(?:order|reorder|buy)\s+(\w+)/);
    const editionMatch = lowerTranscript.match(/(icon|statements?|association|city)/);
    const sizeMatch = lowerTranscript.match(/size\s+(\d+)/);
    const qtyMatch = lowerTranscript.match(/(\d+)\s*(?:jerseys?|pieces?)/);
    
    return {
      type: 'order',
      player_name: playerMatch?.[1] || '',
      edition: normalizeEdition(editionMatch?.[1]),
      size: sizeMatch?.[1],
      order_quantity: parseInt(qtyMatch?.[1] || '1'),
      order_details: {
        priority: lowerTranscript.includes('urgent') || lowerTranscript.includes('asap') ? 'high' : 'medium',
        notes: transcript,
      }
    };
  }
  
  // Check for inventory adjustment commands
  if (lowerTranscript.includes('add') || lowerTranscript.includes('subtract') || lowerTranscript.includes('set')) {
    // Support quantity-first: "add 5 statement jerseys size 50"
    const qtyFirst = lowerTranscript.match(/(?:add|subtract)\s+(\d+)/);
    const editionMatch = lowerTranscript.match(/(icon|statements?|association|city)/);
    const sizeMatch = lowerTranscript.match(/size\s+(\d+)/);
    const qtyMatch = lowerTranscript.match(/(\d+)/);
    const playerMatch = lowerTranscript.match(/(?:add|subtract|set)\s+(?!\d+\b)([a-z]+(?:\s+[a-z]+)?)/);
    
    let delta = 0;
    if (lowerTranscript.includes('add') || lowerTranscript.includes('plus')) {
      delta = parseInt((qtyFirst?.[1] || qtyMatch?.[1]) || '1');
    } else if (lowerTranscript.includes('subtract') || lowerTranscript.includes('minus')) {
      delta = -parseInt((qtyFirst?.[1] || qtyMatch?.[1]) || '1');
    }
    
    return {
      type: 'adjust',
      player_name: playerMatch?.[1]?.trim() || '',
      edition: normalizeEdition(editionMatch?.[1]),
      size: sizeMatch?.[1],
      qty_inventory_delta: delta,
    };
  }

  // Check for set-to commands: "set statement size 50 to 10"
  if (/(^|\b)set\b/.test(lowerTranscript) && /\bto\s+(\d+)/.test(lowerTranscript)) {
    const editionMatch = lowerTranscript.match(/(icon|statements?|association|city)/);
    const sizeMatch = lowerTranscript.match(/size\s+(\d+)/);
    const toMatch = lowerTranscript.match(/\bto\s+(\d+)/);
    const playerMatch = lowerTranscript.match(/set\s+([a-z]+(?:\s+[a-z]+)?)/);
    return {
      type: 'set',
      player_name: playerMatch?.[1]?.trim() || '',
      edition: normalizeEdition(editionMatch?.[1]),
      size: sizeMatch?.[1],
      set_inventory_to: parseInt(toMatch?.[1] || '0', 10),
    };
  }

  // Check for delete commands: "delete all city jerseys", "delete jalen green icon"
  if (lowerTranscript.includes('delete') || lowerTranscript.includes('remove all')) {
    const editionMatch = lowerTranscript.match(/(icon|statements?|association|city)/);
    const sizeMatch = lowerTranscript.match(/size\s+(\d+)/);
    const playerMatch = lowerTranscript.match(/delete\s+([a-z]+(?:\s+[a-z]+)?)/);
    
    return {
      type: 'delete',
      player_name: playerMatch?.[1]?.trim() || '',
      edition: normalizeEdition(editionMatch?.[1]),
      size: sizeMatch?.[1],
    };
  }
  
  return { type: 'unknown' };
}

export async function initiateOrderCall(
  playerName: string,
  edition: string,
  size: string,
  quantity: number = 1
): Promise<CallLog> {
  const { data: userRes } = await supabase.auth.getUser();
  const initiatedBy = userRes.user?.email || 'system';
  
  // Create call log entry
  const { data: callLog, error } = await supabase
    .from('call_logs')
    .insert({
      player_name: playerName,
      edition: edition,
      size: size,
      status: 'initiated',
      initiated_by: initiatedBy,
      order_details: {
        quantity: quantity,
        timestamp: new Date().toISOString(),
      }
    })
    .select()
    .single();
    
  if (error) {
    throw new Error(`Failed to create call log: ${error.message}`);
  }
  
  // Start the actual call process
  try {
    await startVoiceflowCall(callLog.id, playerName, edition, size, quantity);
  } catch (error) {
    // Update call log with error
    await supabase
      .from('call_logs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', callLog.id);
    
    throw error;
  }
  
  return callLog;
}

async function startVoiceflowCall(
  callLogId: string,
  playerName: string,
  edition: string,
  size: string,
  quantity: number
): Promise<void> {
  // Update status to in_progress
  await supabase
    .from('call_logs')
    .update({ status: 'in_progress' })
    .eq('id', callLogId);
  
  try {
    // Call our secure serverless proxy which holds the secret
    const response = await fetch('/api/start-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        call_log_id: callLogId,
        order_details: {
          player_name: playerName,
          edition: edition,
          size: size,
          quantity: quantity,
        },
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      let details: any = {};
      try { details = JSON.parse(text); } catch { details = { raw: text }; }
      const msg = `Voiceflow call API failed: ${response.status} ${response.statusText}` + (details?.error ? ` - ${details.error}` : '');
      throw new Error(msg);
    }
    
    const result = await response.json();
    
    // Update call log with session ID
    await supabase
      .from('call_logs')
      .update({
        voiceflow_session_id: result.session_id,
        transcript: result.transcript,
      })
      .eq('id', callLogId);
      
  } catch (error) {
    // Update call log with error
    await supabase
      .from('call_logs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', callLogId);
    
    throw error;
  }
}

export async function updateCallStatus(
  callLogId: string,
  status: CallLog['status'],
  additionalData?: Partial<CallLog>
): Promise<void> {
  const updateData: any = { status };
  
  if (additionalData) {
    Object.assign(updateData, additionalData);
  }
  
  const { error } = await supabase
    .from('call_logs')
    .update(updateData)
    .eq('id', callLogId);
    
  if (error) {
    throw new Error(`Failed to update call status: ${error.message}`);
  }
}

export async function getCallLogs(limit: number = 50): Promise<CallLog[]> {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    throw new Error(`Failed to fetch call logs: ${error.message}`);
  }
  
  return data || [];
}

export async function getCallLogById(callLogId: string): Promise<CallLog | null> {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('id', callLogId)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch call log: ${error.message}`);
  }
  
  return data;
}


