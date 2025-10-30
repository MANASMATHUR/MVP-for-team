import { supabase } from '../lib/supabaseClient';

export interface InventoryAnalysis {
  recommendations: string[];
  riskAssessment: 'low' | 'medium' | 'high';
  suggestedActions: string[];
  predictedShortages: Array<{
    player_name: string;
    edition: string;
    size: string;
    daysUntilShortage: number;
    confidence: number;
  }>;
}

export interface OrderOptimization {
  suggestedQuantity: number;
  reasoning: string;
  alternatives: Array<{
    quantity: number;
    pros: string[];
    cons: string[];
  }>;
  costEstimate: number;
}

export function buildReorderEmailDraft(input: {
  player_name: string;
  edition: string;
  size: string;
  qty_needed: number;
}) {
  const body = `Subject: Jersey Reorder Request - ${input.player_name} ${input.edition} ${input.size}

Hi Team,

We are at or below threshold for the following item and request reorder:

- Player: ${input.player_name}
- Edition: ${input.edition}
- Size: ${input.size}
- Quantity requested: ${input.qty_needed}

Please advise on lead time and confirm order.

Thanks,
Equipment Team`;
  return body;
}

export async function buildReorderEmailDraftAI(
  fallback: ReturnType<typeof buildReorderEmailDraft>,
) {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) return fallback;
  
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You write concise, professional reorder emails for sports equipment. Include urgency indicators and specific details.'
          },
          { role: 'user', content: fallback },
        ],
        temperature: 0.2,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function analyzeInventory(): Promise<InventoryAnalysis> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return getDefaultAnalysis();
  }

  try {
    const { data: jerseys } = await supabase
      .from('jerseys')
      .select('*');
    
    await supabase
      .from('activity_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (!jerseys) {
      return getDefaultAnalysis();
    }

    const inventorySummary = jerseys.map(j => ({
      player: j.player_name,
      edition: j.edition,
      size: j.size,
      current_stock: j.qty_inventory,
      due_to_lva: j.qty_due_lva,
      last_updated: j.updated_at,
    }));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an inventory management AI for a professional basketball team. Analyze inventory data and provide insights on:
            1. Risk assessment (low/medium/high)
            2. Recommendations for inventory management
            3. Suggested actions to prevent stockouts
            4. Predictions for potential shortages
            
            Consider factors like:
            - Current stock levels
            - Historical usage patterns
            - Season timing
            - Player popularity
            - Edition types
            
            Respond with a JSON object containing: recommendations (array), riskAssessment (string), suggestedActions (array), predictedShortages (array of objects with player_name, edition, size, daysUntilShortage, confidence).`
          },
          {
            role: 'user',
            content: `Analyze this inventory data: ${JSON.stringify(inventorySummary)}`
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      return getDefaultAnalysis();
    }

    const data = await res.json();
    const analysisText = data.choices?.[0]?.message?.content?.trim();
    
    try {
      return JSON.parse(analysisText);
    } catch {
      return getDefaultAnalysis();
    }
  } catch (error) {
    console.error('OpenAI analysis error:', error);
    return getDefaultAnalysis();
  }
}

function getDefaultAnalysis(): InventoryAnalysis {
  return {
    recommendations: [
      'Monitor low stock items daily',
      'Set up automated reorder alerts',
      'Consider bulk ordering for popular items',
    ],
    riskAssessment: 'medium',
    suggestedActions: [
      'Review inventory levels weekly',
      'Contact suppliers for lead times',
      'Implement safety stock levels',
    ],
    predictedShortages: [],
  };
}

export async function optimizeOrderQuantity(
  playerName: string,
  edition: string,
  size: string,
  currentStock: number
): Promise<OrderOptimization> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return getDefaultOrderOptimization();
  }

  try {
    // Get historical data for this specific jersey
    await supabase
      .from('activity_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .contains('details', { player_name: playerName });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an inventory optimization AI. Given jersey details and current stock, suggest optimal order quantities considering:
            1. Current stock level
            2. Historical usage patterns
            3. Season timing
            4. Lead times
            5. Storage constraints
            6. Cost considerations
            
            Respond with a JSON object containing: suggestedQuantity (number), reasoning (string), alternatives (array of objects with quantity, pros, cons), costEstimate (number).`
          },
          {
            role: 'user',
            content: `Optimize order for: Player: ${playerName}, Edition: ${edition}, Size: ${size}, Current Stock: ${currentStock}`
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      return getDefaultOrderOptimization();
    }

    const data = await res.json();
    const optimizationText = data.choices?.[0]?.message?.content?.trim();
    
    try {
      return JSON.parse(optimizationText);
    } catch {
      return getDefaultOrderOptimization();
    }
  } catch (error) {
    console.error('OpenAI optimization error:', error);
    return getDefaultOrderOptimization();
  }
}

function getDefaultOrderOptimization(): OrderOptimization {
  return {
    suggestedQuantity: 5,
    reasoning: 'Standard reorder quantity based on typical usage patterns',
    alternatives: [
      {
        quantity: 3,
        pros: ['Lower upfront cost', 'Less storage space needed'],
        cons: ['May need more frequent reorders', 'Higher per-unit cost'],
      },
      {
        quantity: 10,
        pros: ['Better bulk pricing', 'Fewer reorders needed'],
        cons: ['Higher upfront cost', 'More storage space required'],
      },
    ],
    costEstimate: 375,
  };
}

export async function generateInventoryReport(): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return generateDefaultReport();
  }

  try {
    const { data: jerseys } = await supabase
      .from('jerseys')
      .select('*');
    
    const { data: callLogs } = await supabase
      .from('call_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (!jerseys) {
      return generateDefaultReport();
    }

    const reportData = {
      totalJerseys: jerseys.length,
      lowStockItems: jerseys.filter(j => j.qty_inventory <= 1).length,
      totalValue: jerseys.reduce((sum, j) => sum + (j.qty_inventory * 75), 0),
      recentOrders: callLogs?.length || 0,
      editionBreakdown: jerseys.reduce((acc, j) => {
        acc[j.edition] = (acc[j.edition] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional inventory management analyst. Generate a comprehensive monthly inventory report with insights, trends, and recommendations. Format as a professional business report.'
          },
          {
            role: 'user',
            content: `Generate a report for this data: ${JSON.stringify(reportData)}`
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      return generateDefaultReport();
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || generateDefaultReport();
  } catch (error) {
    console.error('OpenAI report generation error:', error);
    return generateDefaultReport();
  }
}

function generateDefaultReport(): string {
  return `# Monthly Inventory Report

## Summary
- Total jerseys in inventory: [Data not available]
- Low stock items: [Data not available]
- Total inventory value: [Data not available]

## Recommendations
1. Review low stock items and place reorders
2. Analyze usage patterns to optimize stock levels
3. Consider seasonal variations in demand

## Next Steps
- Schedule weekly inventory reviews
- Set up automated reorder alerts
- Monitor supplier lead times
`;
}

export async function suggestInventoryImprovements(): Promise<string[]> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return [
      'Implement automated reorder alerts',
      'Set up inventory tracking dashboards',
      'Create supplier relationship management system',
      'Develop demand forecasting models',
    ];
  }

  try {
    const { data: jerseys } = await supabase
      .from('jerseys')
      .select('*');

    if (!jerseys) {
      return [
        'Implement automated reorder alerts',
        'Set up inventory tracking dashboards',
        'Create supplier relationship management system',
        'Develop demand forecasting models',
      ];
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an inventory management consultant. Suggest specific, actionable improvements for inventory management systems. Focus on automation, efficiency, and cost reduction.'
          },
          {
            role: 'user',
            content: `Suggest improvements for an inventory system with ${jerseys.length} jersey items. Current challenges include manual tracking and reorder processes.`
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      return [
        'Implement automated reorder alerts',
        'Set up inventory tracking dashboards',
        'Create supplier relationship management system',
        'Develop demand forecasting models',
      ];
    }

    const data = await res.json();
    const suggestionsText = data.choices?.[0]?.message?.content?.trim();
    
    const suggestions = suggestionsText
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim())
      .filter((line: string) => line.length > 10);
    
    return suggestions.length > 0 ? suggestions : [
      'Implement automated reorder alerts',
      'Set up inventory tracking dashboards',
      'Create supplier relationship management system',
      'Develop demand forecasting models',
    ];
  } catch (error) {
    console.error('OpenAI suggestions error:', error);
    return [
      'Implement automated reorder alerts',
      'Set up inventory tracking dashboards',
      'Create supplier relationship management system',
      'Develop demand forecasting models',
    ];
  }
}
  
export interface VoiceCommand {
  type: 'add' | 'remove' | 'delete' | 'set' | 'turn_in' | 'laundry_return' | 'order' | 'show' | 'filter' | 'generate' | 'unknown';
  player_name?: string;
  edition?: string;
  size?: string;
  quantity?: number;
  target_quantity?: number;
  recipient?: string;
  notes?: string;
  filter_type?: 'low_stock' | 'zero_stock' | 'lva' | 'player' | 'edition';
  action?: 'reorder_email' | 'report' | 'export';
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
let chatHistory: ChatMessage[] = [];
const CHAT_STORAGE_KEY = 'hr_chat_history_v1';

function loadChatHistoryFromStorage(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-50);
  } catch {}
  return [];
}

function saveChatHistoryToStorage(history: ChatMessage[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history.slice(-50)));
  } catch {}
}

export function resetConversationMemory() {
  chatHistory = [];
  try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
}

export async function getConversationalReply(userText: string, opts?: {
  systemPromptOverride?: string;
  context?: Record<string, unknown>;
}): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

  // Fallback simple responses if no API key
  if (!key) {
    // Very lightweight local reply mimicking small talk
    const lower = userText.toLowerCase();
    if (/how are you|what's up/.test(lower)) return "I'm good and ready to help with inventory!";
    if (/hello|hi|hey/.test(lower)) return "Hi! How can I help with your inventory today?";
    if (/thank/.test(lower)) return "You're welcome!";
    return "I can help with inventory tasks and general questions. What would you like to do?";
  }

  const systemPrompt =
    opts?.systemPromptOverride ||
    `You are an efficient, friendly assistant embedded in a Houston Rockets inventory app.
Keep replies concise (1-3 sentences) unless the user asks for detail.
You can chat casually, but prioritize being helpful for inventory workflows.`;

  // Load from storage if empty
  if (chatHistory.length === 0) {
    chatHistory = loadChatHistoryFromStorage();
  }

  // Initialize history with system prompt once per session
  if (chatHistory.length === 0) {
    chatHistory.push({ role: 'system', content: systemPrompt });
  }

  // Append lightweight context once as an assistant note if provided and not already present
  if (opts?.context) {
    const serialized = JSON.stringify(opts.context).slice(0, 2000);
    const hasContext = chatHistory.some(m => m.role === 'assistant' && m.content.startsWith('[context]'));
    if (!hasContext) {
      chatHistory.push({ role: 'assistant', content: `[context] ${serialized}` });
    }
  }

  chatHistory.push({ role: 'user', content: userText });
  saveChatHistoryToStorage(chatHistory);

  // Keep the window reasonably small
  const windowed = chatHistory.slice(-14);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: windowed,
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || res.statusText);
    }

    const data = await res.json();
    const reply: string = data.choices?.[0]?.message?.content?.trim() || '';
    if (reply) {
      chatHistory.push({ role: 'assistant', content: reply });
      saveChatHistoryToStorage(chatHistory);
      // Trim again if needed
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
      return reply;
    }
    return ' '; // avoid speaking "undefined"
  } catch (err) {
    console.error('OpenAI conversational reply error:', err);
    return 'Sorry, I had trouble generating a response.';
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    throw new Error('OpenAI API key not configured');
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('OpenAI API key invalid or expired');
      } else if (response.status === 429) {
        throw new Error('OpenAI API rate limit exceeded or insufficient credits');
      } else if (response.status === 402) {
        throw new Error('OpenAI API payment required - insufficient credits');
      } else {
        throw new Error(`OpenAI Whisper API failed: ${response.statusText} - ${errorData.error?.message || ''}`);
      }
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error('OpenAI Whisper transcription error:', error);
    throw error;
  }
}

export async function interpretVoiceCommandWithAI(transcript: string, _currentInventory: any[]): Promise<VoiceCommand | VoiceCommand[]> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return { type: 'unknown' };
  }
  try {
    const systemPrompt = `You are an extremely practical, detail-oriented AI assistant helping an NBA equipment manager track player jerseys in real time and under pressure. Your job is:

- Listen to very casual, conversational, even noisy English describing events. The input could include multiple unrelated sentences, dictation, notes, or informal/ungrammatical language.
- Extract ALL inventory actions described, even if mixed with small talk or vague references.
- Always output a JSON array describing each action as a structured object.
- Focus on these top 4 events:
  1. Reduce inventory because jersey was given away (to player, fan, staff, friend, etc)
  2. Reduce inventory because jersey was sent to cleaners/laundry (these will be unavailable 2-3 days)
  3. Add inventory because an order was placed (track vendor if possible, e.g. Nike, New Era)
  4. Add inventory because item was received (either from an order, or just back from laundry)
- Include relevant information:
  - Player name (if any)
  - Edition/style (Icon, Association, Statement, City, Limited, etc)
  - Size (if spoken)
  - Quantity
  - Vendor (if available)
  - Where items go (locker, closet, storage, etc)
- Track constraints: Each player can have only 2-3 jerseys in a locker and 3-5 in the closet, so never assume infinite space or stock.

Examples:
- "Hey I just gave 2 city jerseys to a fan and sent 3 association jerseys to laundry for Jalen Green, also add 1 limited jersey for Kevin that arrived from Nike."
Should reply with:
[
  {"type": "turn_in", "edition": "City", "quantity": 2, "recipient":"Fan"},
  {"type":"turn_in", "edition": "Association", "quantity": 3, "player_name":"Jalen Green", "recipient":"Laundry"},
  {"type":"add", "edition":"Limited", "quantity":1, "player_name":"Kevin", "vendor":"Nike", "notes":"received"}
]

- "Order 5 icon jerseys from New Era and received three statements from laundry."
[
  {"type":"add", "edition":"Icon", "quantity":5, "vendor":"New Era", "notes":"order_placed"},
  {"type":"laundry_return", "edition":"Statement", "quantity":3}
]

- If user says “Put these 2 jerseys in Kevin’s locker but only keep 3 total there.”, make a note about locker limit.

Response: Only return the pure JSON array of inventory change instructions, no explanations or summaries. Always ignore non-inventory chitchat in your JSON!`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Voice command: "${transcript}"` }
        ],
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('OpenAI API key invalid or expired');
      } else if (response.status === 429) {
        throw new Error('OpenAI API rate limit exceeded or insufficient credits');
      } else if (response.status === 402) {
        throw new Error('OpenAI API payment required - insufficient credits');
      } else {
        throw new Error(`OpenAI API failed: ${response.statusText} - ${errorData.error?.message || ''}`);
      }
    }
    const data = await response.json();
    const commandText = data.choices?.[0]?.message?.content?.trim();
    try {
      return JSON.parse(commandText);
    } catch {
      return { type: 'unknown' };
    }
  } catch (error) {
    console.error('OpenAI command interpretation error:', error);
    return { type: 'unknown' };
  }
}

export async function generateReorderEmailWithVoice(voiceCommand: VoiceCommand, inventoryItem?: any): Promise<string> {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!key) {
    return generateDefaultReorderEmail(voiceCommand);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional equipment manager for the Houston Rockets. Generate concise, professional reorder emails for jersey inventory. Include urgency indicators and specific details.`
          },
          {
            role: 'user',
            content: `Generate a reorder email for: ${JSON.stringify(voiceCommand)}${inventoryItem ? `\nCurrent inventory: ${JSON.stringify(inventoryItem)}` : ''}`
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      return generateDefaultReorderEmail(voiceCommand);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || generateDefaultReorderEmail(voiceCommand);
  } catch (error) {
    console.error('OpenAI email generation error:', error);
    return generateDefaultReorderEmail(voiceCommand);
  }
}

function generateDefaultReorderEmail(command: VoiceCommand): string {
  const player = command.player_name || 'Player';
  const edition = command.edition || 'jersey';
  const size = command.size || 'standard';
  const quantity = command.quantity || 1;

  return `Subject: Jersey Reorder Request - ${player} ${edition} ${size}

Hi Team,

We are at or below threshold for the following item and request reorder:

- Player: ${player}
- Edition: ${edition}
- Size: ${size}
- Quantity requested: ${quantity}

Please advise on lead time and confirm order.

Thanks,
Equipment Team`;
}


