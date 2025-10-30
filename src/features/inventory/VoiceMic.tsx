import { useEffect, useRef, useState } from 'react';
import { transcribeAudio, interpretVoiceCommandWithAI, getConversationalReply, type VoiceCommand } from '../../integrations/openai';
import type { JerseyItem } from '../../types';
import { Mic, Volume2, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ActionResultInfo {
  removed?: number;
  added?: number;
  setTo?: number;
}

interface ActionResult {
  success: boolean;
  info?: ActionResultInfo;
}

interface Props {
  rows: JerseyItem[];
  onAction: (command: VoiceCommand) => Promise<boolean | ActionResult> | boolean | ActionResult;
  locked?: boolean; // keep mic open and auto-restart between utterances
  large?: boolean;  // big button for mobile sticky bar
}

export function VoiceMic({ rows, onAction, locked = false, large = false }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<'idle' | 'recording' | 'transcribing' | 'interpreting' | 'executing' | 'success' | 'error'>('idle');
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const touchTimeoutRef = useRef<number | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastAssistantReplyRef = useRef<string>('');
  const [hasGreeted, setHasGreeted] = useState(false);

  const playBeep = () => {
    try {
      const AudioCtx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.16);
      oscillator.onended = () => ctx.close();
    } catch {}
  };

  const speak = (text: string) => {
    if (typeof window.speechSynthesis === 'undefined') {
      return;
    }
    
    const speechSynthesis = window.speechSynthesis;
    if (!speechSynthesis) {
      return;
    }
    
    if (speechSynthesis.speaking) {
      // Barge-in: stop current speech immediately
      speechSynthesis.cancel();
    }
    
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92; // slightly slower for clarity
        utterance.pitch = 0.95; // warmer tone
        utterance.volume = 1.0;
        utterance.lang = 'en-US';
        
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          // prefer high-quality English female voices where available
          const preferred = voices.find(v => /en-US/i.test(v.lang) && /female|samantha|google us english/i.test((v as any).name || ''))
            || voices.find(v => /en-US/i.test(v.lang))
            || voices.find(v => v.lang.startsWith('en'));
          if (preferred) utterance.voice = preferred;
        }
        
        // Track utterance to support barge-in
        currentUtteranceRef.current = utterance;

        utterance.onend = () => {
          currentUtteranceRef.current = null;
        };

        speechSynthesis.speak(utterance);
        // Update last assistant reply for echo guard
        lastAssistantReplyRef.current = text;
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          // Mobile browsers need multiple attempts for speech synthesis
          setTimeout(() => {
            if (!speechSynthesis.speaking) {
              speechSynthesis.speak(utterance);
            }
          }, 500);
          
          // Second attempt after 1.5 seconds
          setTimeout(() => {
            if (!speechSynthesis.speaking) {
              speechSynthesis.speak(utterance);
            }
          }, 1500);
          
          // Final attempt after 3 seconds
          setTimeout(() => {
            if (!speechSynthesis.speaking) {
              speechSynthesis.speak(utterance);
            }
          }, 3000);
        }
        
      } catch (error) {
        // Silent fail
      }
    }, 100);
  };

  // Removed auto-greeting to avoid feedback loops

  const getConfirmationMessage = (command: VoiceCommand, info?: ActionResultInfo) => {
    switch (command.type) {
      case 'add':
        return `Ok, added ${command.quantity || 0} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} to inventory.`;
      case 'remove':
        return `Ok, removed ${command.quantity || 0} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} from inventory.`;
      case 'set':
        return `Ok, set ${command.player_name || ''} ${command.edition || ''} jerseys${command.size ? ` size ${command.size}` : ''} to ${command.target_quantity || 0} in inventory.`;
      case 'delete':
        return `Ok, removed ${typeof info?.removed === 'number' ? info.removed : (command.quantity || 0)} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} from inventory.`;
      case 'order':
        return `Ok, order placed for ${command.quantity || 0} ${command.edition || ''} jerseys${command.size ? ` size ${command.size}` : ''}.`;
      case 'turn_in':
        return `Ok, turned in ${command.quantity || 0} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.recipient ? ` to ${command.recipient}` : ''}.`;
      default:
        return "Ok, command executed successfully.";
    }
  };

  // removed unused isGeneralChat utility

  const handleGeneralConversation = async (text: string): Promise<string> => {
    // Provide minimal app context so replies can reference role succinctly
    const reply = await getConversationalReply(text, {
      context: { feature: 'inventory', lastCommand },
    });
    return reply;
  };

  useEffect(() => {
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasSpeechRecognition = typeof (window as any).SpeechRecognition !== 'undefined' || typeof (window as any).webkitSpeechRecognition !== 'undefined';
    const hasSpeechSynthesis = typeof speechSynthesis !== 'undefined';
    
    const isSecureContext = window.isSecureContext || location.protocol === 'https:';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isSecure = isSecureContext || isLocalhost;
    
    if (!isSecure) {
      setSupported(false);
      return;
    }
    
    if (!hasMediaRecorder && !hasSpeechRecognition) {
      setSupported(false);
      return;
    }
    
    if (hasSpeechSynthesis) {
      setSpeechSynthesis(window.speechSynthesis);
    }
    
    setSupported(true);
  }, []);

  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setProcessingStep('error');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        alert('Speech recognition is not supported on this mobile browser. Please:\n1. Use Chrome or Safari on mobile\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
      } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      }
      return;
    }
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
      }
      
      recognition.onstart = () => {
        setListening(true);
        setProcessingStep('recording');
        setTranscript('');
        playBeep();
        // Barge-in: stop TTS if it is speaking when user starts talking
        if (window.speechSynthesis?.speaking) {
          window.speechSynthesis.cancel();
        }
      };
      
      recognition.onresult = async (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (interimTranscript) {
          setTranscript(interimTranscript);
        }
        
        if (finalTranscript) {
          setTranscript(finalTranscript);
          // Echo guard: ignore if it's exactly the last assistant reply
          if (lastAssistantReplyRef.current && finalTranscript.trim() === lastAssistantReplyRef.current.trim()) {
            setProcessingStep('idle');
            return;
          }
          await processVoiceCommand(finalTranscript);
        }
      };
      
      recognition.onend = () => {
        setListening(false);
        setProcessingStep('idle');
        if (locked) {
          // auto-restart after a short pause for noisy environments
          setTimeout(() => {
            if (!listening) startBrowserSpeechRecognition();
          }, 300);
        }
      };
      
      recognition.onerror = (event: any) => {
        setListening(false);
        setProcessingStep('error');
        
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please:\n1. Allow microphone permission in your browser\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
        } else if (event.error === 'no-speech') {
          setTimeout(() => setProcessingStep('idle'), 1000);
        } else if (event.error === 'audio-capture') {
          alert('No microphone found. Please:\n1. Check your microphone is connected\n2. Make sure no other app is using the microphone\n3. Try refreshing the page');
        } else if (event.error === 'network') {
          alert('Network error. Please check your internet connection and try again.');
        } else if (event.error === 'service-not-allowed') {
          alert('Speech recognition service not allowed. Please:\n1. Use Chrome or Safari\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
        } else {
          setTimeout(() => setProcessingStep('idle'), 2000);
        }
      };
      
      recognition.start();
    } catch (error) {
      setProcessingStep('error');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        alert('Speech recognition failed on mobile. Please:\n1. Use Chrome or Safari\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page\n4. Check microphone permissions');
      }
    }
  };

  // After any speech command, success or fail, reset listening and processingStep to idle
  const processVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;
    setIsProcessing(true);
    setProcessingStep('interpreting');
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      let commands: VoiceCommand | VoiceCommand[];
      if (apiKey) {
        commands = await interpretVoiceCommandWithAI(transcript, rows);
        if (!commands || (Array.isArray(commands) && commands.every(cmd => cmd.type === 'unknown')) || (!Array.isArray(commands) && commands.type === 'unknown')) {
          commands = interpretVoiceCommandLocal(transcript);
        }
      } else {
        commands = interpretVoiceCommandLocal(transcript);
      }

      // If multiple actions, always run all
      let allSucceeded = false;
      let confirmations: string[] = [];
      if (Array.isArray(commands)) {
        allSucceeded = false;
        for (const command of commands) {
          setLastCommand(command);
          setProcessingStep('executing');
          const actionResult = await Promise.resolve(onAction(command));
          const succeeded = typeof actionResult === 'object' ? actionResult.success : !!actionResult;
          const info: ActionResultInfo | undefined = typeof actionResult === 'object' ? actionResult.info : undefined;
          if (succeeded) {
            confirmations.push(getConfirmationMessage(command, info));
          }
          allSucceeded = allSucceeded || succeeded;
        }
      } else {
        setLastCommand(commands);
        setProcessingStep('executing');
        const actionResult = await Promise.resolve(onAction(commands));
        const succeeded = typeof actionResult === 'object' ? actionResult.success : !!actionResult;
        const info: ActionResultInfo | undefined = typeof actionResult === 'object' ? actionResult.info : undefined;
        if (succeeded) {
          confirmations.push(getConfirmationMessage(commands, info));
        }
        allSucceeded = succeeded;
      }
      if (confirmations.length) {
        setProcessingStep('success');
        for (const msg of confirmations) {
          speak(msg);
        }
      } else {
        setProcessingStep('error');
        if (navigator.vibrate) {
          navigator.vibrate([50, 50, 50]);
        }
      }
      setTimeout(() => {
        setProcessingStep('idle');
        setLastCommand(null);
        setListening(false); // Ensure MIC always resets
      }, 3000);
    } catch (error) {
      setProcessingStep('error');
      setTimeout(() => {
        setProcessingStep('idle');
        setListening(false); // Always reset after error too
      }, 2000);
    } finally {
      setIsProcessing(false);
      setListening(false); // Always cleanup on finally
      setTranscript('');
    }
  };

  const interpretVoiceCommandLocal = (transcript: string): VoiceCommand => {
    const lowerTranscript = transcript.toLowerCase();

    // Convert common number words to digits for better matching
    const wordToNum: Record<string, string> = {
      'zero': '0', 'one': '1', 'two': '2', 'to': '2', 'too': '2', 'three': '3', 'four': '4', 'for': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'ate': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20'
    };
    const normalizedNumbers = lowerTranscript.replace(/\b(zero|one|two|to|too|three|four|for|five|six|seven|eight|ate|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (m) => wordToNum[m] || m);
    
    const extractPlayerName = (text: string) => {
      const playerPatterns = [
        /(?:add|remove|set|delete|order)\s+([a-z]+(?:\s+[a-z]+)?)/i,
        /([a-z]+(?:\s+[a-z]+)?)\s+(?:jersey|jerseys)/i,
        /(?:for|to)\s+([a-z]+(?:\s+[a-z]+)?)/i
      ];
      
      for (const pattern of playerPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (!['jersey', 'jerseys', 'size', 'edition', 'icon', 'statement', 'association', 'city', 'to', 'for', 'of', 'the'].includes(name.toLowerCase())) {
            return name;
          }
        }
      }
      return '';
    };

    const normalizeEdition = (s?: string) => {
      if (!s) return s;
      const singular = s.replace(/s\b/, '');
      const lowerSingular = singular.toLowerCase();
      
      if (/icon/.test(lowerSingular)) return 'Icon';
      if (/statement/.test(lowerSingular)) return 'Statement';
      if (/association/.test(lowerSingular)) return 'Association';
      if (/city/.test(lowerSingular)) return 'City';
      
      return undefined;
    };

    // Support "give away/turn in/hand over" -> turn_in with optional recipient "to X"
    const giveAwayMatch = normalizedNumbers.match(/\b(give away|give|hand over|turn in|turn over|pass|donate)\s+(\d+)\s+(?:of\s+)?(icon|icons?|statement|statements?|association|associations?|city|cities)?\s*(?:jersey|jerseys)?(?:\s+to\s+([a-z]+(?:\s+[a-z]+)?))?/i);
    if (giveAwayMatch) {
      const qty = parseInt(giveAwayMatch[2], 10);
      const editionWord = giveAwayMatch[3];
      const recipientWord = giveAwayMatch[4];
      const normalizedEdition = editionWord ? editionWord.replace(/s\b/, '') : undefined;
      return {
        type: 'turn_in',
        edition: normalizedEdition ? normalizedEdition.charAt(0).toUpperCase() + normalizedEdition.slice(1).toLowerCase() : undefined,
        quantity: isNaN(qty) ? 1 : qty,
        recipient: recipientWord ? recipientWord.trim().replace(/\b\w/g, c => c.toUpperCase()) : undefined,
      };
    }

    // Direct pattern: "delete/remove <qty> <edition> jerseys" -> delete
    const directDelete = normalizedNumbers.match(/\b(delete|remove)\s+(\d+)\s+(?:of\s+)?(icon|icons?|statement|statements?|association|associations?|city|cities)\s+(?:jersey|jerseys)\b/i);
    if (directDelete) {
      const qty = parseInt(directDelete[2], 10);
      const editionWord = directDelete[3];
      const normalizedEdition = editionWord ? editionWord.replace(/s\b/, '') : undefined;
      return {
        type: 'delete',
        edition: normalizedEdition ? normalizedEdition.charAt(0).toUpperCase() + normalizedEdition.slice(1).toLowerCase() : undefined,
        quantity: isNaN(qty) ? 1 : qty,
      };
    }

    if (normalizedNumbers.includes('delete') || normalizedNumbers.includes('remove all') || normalizedNumbers.includes('clear')) {
      const editionMatch = normalizedNumbers.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = normalizedNumbers.match(/size\s+(\d+)/i);
      const qtyMatch = normalizedNumbers.match(/(\d+)/);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'delete',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    if (normalizedNumbers.includes('add') || normalizedNumbers.includes('plus') || normalizedNumbers.includes('increase') || normalizedNumbers.includes('inc ') || normalizedNumbers.includes('more') || normalizedNumbers.includes('additional') || normalizedNumbers.includes('put') || normalizedNumbers.includes('place') || normalizedNumbers.includes('create')) {
      const qtyMatch = normalizedNumbers.match(/(\d+)/);
      const editionMatch = normalizedNumbers.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = normalizedNumbers.match(/size\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'add' as const,
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    if (normalizedNumbers.includes('remove') || normalizedNumbers.includes('subtract') || normalizedNumbers.includes('minus') || normalizedNumbers.includes('decrease') || normalizedNumbers.includes('dec ') || normalizedNumbers.includes('take away') || normalizedNumbers.includes('takeaway')) {
      const qtyMatch = normalizedNumbers.match(/(\d+)/);
      const editionMatch = normalizedNumbers.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = normalizedNumbers.match(/size\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'remove',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    if ((lowerTranscript.includes('set') || lowerTranscript.includes('update')) && lowerTranscript.includes('to')) {
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeToMatch = lowerTranscript.match(/size\s+to\s+(\d+)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const toMatch = lowerTranscript.match(/\bto\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);

      if (sizeToMatch) {
        return {
          type: 'set',
          player_name: playerName,
          edition: normalizeEdition(editionMatch?.[1]),
          size: sizeToMatch?.[1],
          notes: 'set_size',
        };
      }
      
      return {
        type: 'set',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        target_quantity: parseInt(toMatch?.[1] || '0', 10),
      };
    }

    if (lowerTranscript.includes('order') || lowerTranscript.includes('reorder') || lowerTranscript.includes('buy')) {
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const qtyMatch = lowerTranscript.match(/(\d+)/);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'order',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    // EXTENDED: Match flexible jersey returns from laundry and similar phrases
    const flexLaundryReturn = normalizedNumbers.match(/(?:([\d]+)\s+)?(?:(icon|icons?|statement|statements?|association|associations?|city|cities)\s*)?(?:jersey|jerseys)?\s*(?:has|have|was|were|is|are)?\s*(?:arrived|returned|came|come|back|received|done|finished|delivered)?\s*(?:from|out of)?\s*(laundry|cleaner|cleaners|cleaned|wash|washed|washing)/i);
    if (flexLaundryReturn) {
      const qty = parseInt(flexLaundryReturn[1], 10) || 1;
      const editionWord = flexLaundryReturn[2];
      const normalizedEdition = editionWord ? editionWord.replace(/s\b/, '') : undefined;
      return {
        type: 'laundry_return',
        edition: normalizedEdition ? normalizedEdition.charAt(0).toUpperCase() + normalizedEdition.slice(1).toLowerCase() : undefined,
        quantity: qty,
      };
    }
    // EXTENDED: Very flexible give-away/gift/transfer to non-laundry recipients (passive and active)
    const flexGiveAway = normalizedNumbers.match(/(?:([\d]+)\s+)?(?:(icon|icons?|statement|statements?|association|associations?|city|cities)\s*)?(?:jersey|jerseys)?\s*(?:has|have|was|were|is|are)?\s*(?:given away|given|gifted|handed|transferred|donated|presented|sent|turned in)?\s*(?:to|for)?\s*(fan|player|coach|staff|[a-z]+)/i);
    if (flexGiveAway) {
      const qty = parseInt(flexGiveAway[1], 10) || 1;
      const editionWord = flexGiveAway[2];
      const recipientWord = flexGiveAway[3];
      const normalizedEdition = editionWord ? editionWord.replace(/s\b/, '') : undefined;
      return {
        type: 'turn_in',
        edition: normalizedEdition ? normalizedEdition.charAt(0).toUpperCase() + normalizedEdition.slice(1).toLowerCase() : undefined,
        quantity: qty,
        recipient: recipientWord ? recipientWord.trim().replace(/\b\w/g, c => c.toUpperCase()) : undefined,
      };
    }

    return { type: 'unknown' };
  };

  const startListening = async () => {
    if (listening) return;
    
    // One-time friendly greeting on first button click (no recording during greeting)
    if (!hasGreeted) {
      setHasGreeted(true);
      speak("I'm listening. Say things like 'send two association jerseys to cleaners' or 'give away three city jerseys'.");
      return;
    }
    
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      setApiError('OpenAI API credits exhausted. Using browser speech recognition.');
      startBrowserSpeechRecognition();
      return;
    }
    
    if (apiError) {
      startBrowserSpeechRecognition();
      return;
    }
    
    setApiError(null);
    
    if (typeof MediaRecorder !== 'undefined') {
      try {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        
        if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android') || navigator.userAgent.includes('iPhone')) {
          // For mobile, use simpler constraints
        } else {
          audioConstraints.sampleRate = 44100;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints
        });
        
        const supportedMimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/ogg;codecs=opus',
          'audio/wav'
        ];
        
        let selectedMimeType = 'audio/webm';
        for (const mimeType of supportedMimeTypes) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            break;
          }
        }
        
        const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        // Barge-in: stop any ongoing TTS when mic starts
        if (window.speechSynthesis?.speaking) {
          window.speechSynthesis.cancel();
        }

        // Removed VAD: mic will only stop when user presses the button
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          setProcessingStep('transcribing');
          const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
          
          try {
            const transcript = await transcribeAudio(audioBlob);
            setTranscript(transcript);
            // Show in transcript list as user message for chat feel
            setMessages(prev => [...prev, { role: 'user' as const, content: transcript }].slice(-10));
            await processVoiceCommand(transcript);
          } catch (error) {
            setProcessingStep('error');
            
            if (error instanceof Error) {
              if (error.message.includes('insufficient credits') || error.message.includes('payment required')) {
                setApiError('OpenAI API credits exhausted. Using browser speech recognition.');
                stream.getTracks().forEach(track => track.stop());
                setListening(false);
                setProcessingStep('idle');
                
                setTimeout(() => {
                  startBrowserSpeechRecognition();
                }, 300);
                return;
              }
            }
            
            setTimeout(() => setProcessingStep('idle'), 3000);
          }
          
          // No VAD cleanup required
          stream.getTracks().forEach(track => track.stop());
          setListening(false);
          if (locked) {
            setTimeout(() => {
              if (!listening && !isProcessing) startBrowserSpeechRecognition();
            }, 300);
          }
        };
        
        // Reset chat memory on first listen of a session if user long-paused before
        // (leave as no-op for now; expose a dedicated reset control elsewhere if needed)
        mediaRecorder.start();
        setListening(true);
        setProcessingStep('recording');
        playBeep();
        // Removed mobile greeting backup to prevent echo/repetition
        
      } catch (error) {
        setProcessingStep('error');
        
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            alert('Microphone access denied. Please:\n1. Allow microphone permission in your browser\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
          } else if (error.name === 'NotFoundError') {
            alert('No microphone found. Please:\n1. Check your microphone is connected\n2. Make sure no other app is using the microphone\n3. Try refreshing the page');
          } else if (error.name === 'NotSupportedError') {
            alert('Audio recording not supported on this device. Please:\n1. Use a modern browser (Chrome, Safari, Firefox)\n2. Make sure you\'re using HTTPS\n3. Try on a different device');
          } else if (error.name === 'SecurityError') {
            alert('Security error: This feature requires HTTPS. Please:\n1. Make sure you\'re using https:// in the URL\n2. Try refreshing the page\n3. Contact support if the issue persists');
          }
        }
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          setTimeout(() => {
            startBrowserSpeechRecognition();
          }, 1000);
        }
      }
      } else {
        startBrowserSpeechRecognition();
      }
  };

  // Also ensure stopListening() always sets step to idle
  const stopListening = () => {
    if (!listening) return;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setListening(false); // Always reset
    setProcessingStep('idle');
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Volume2 className="h-4 w-4" />
        <span>Voice not supported</span>
        <div className="text-xs text-gray-400">
          {location.protocol !== 'https:' ? 'HTTPS required for microphone access' : 'Check browser console for details'}
        </div>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (processingStep) {
      case 'recording':
        return (
          <div className="relative">
            <Mic className="h-4 w-4 animate-pulse text-red-500" />
            <div className="absolute -inset-1 bg-red-100 rounded-full animate-ping opacity-75"></div>
          </div>
        );
      case 'transcribing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'interpreting':
        return <Loader2 className="h-4 w-4 animate-spin text-purple-500" />;
      case 'executing':
        return <Loader2 className="h-4 w-4 animate-spin text-orange-500" />;
      case 'success':
        return (
          <div className="relative">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div className="absolute -inset-1 bg-green-100 rounded-full animate-ping opacity-75"></div>
          </div>
        );
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500 animate-bounce" />;
      default:
        return <Mic className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (processingStep) {
      case 'recording':
        return 'Recording...';
      case 'transcribing':
        return 'Transcribing...';
      case 'interpreting':
        return 'Understanding...';
      case 'executing':
        return 'Executing...';
      case 'success':
        return 'Success!';
      case 'error':
        return 'Error';
      default:
        return listening ? 'Stop' : 'Voice';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${large ? 'w-full' : ''}`}>
      <button
        className={`${large
            ? `mic-pill ${listening ? 'recording' : isProcessing ? 'processing' : 'idle'}`
            : `btn btn-sm ${listening ? 'btn-error' : isProcessing ? 'btn-warning' : 'btn-secondary'}`
          }`}
        onClick={listening ? stopListening : startListening}
        disabled={isProcessing}
        onTouchStart={() => {
          // Long-press to start on mobile (prevents accidental taps)
          if (touchTimeoutRef.current) window.clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = window.setTimeout(() => {
            if (!listening && !isProcessing) startListening();
          }, 250);
        }}
        onTouchEnd={() => {
          if (touchTimeoutRef.current) {
            window.clearTimeout(touchTimeoutRef.current);
            touchTimeoutRef.current = null;
          }
          // Release to stop
          if (listening) stopListening();
        }}
        onTouchCancel={() => {
          if (touchTimeoutRef.current) {
            window.clearTimeout(touchTimeoutRef.current);
            touchTimeoutRef.current = null;
          }
          if (listening) stopListening();
        }}
      >
        {large ? (
          <div className="mic-content">
            <div className={`mic-icon ${processingStep}`}>{getStatusIcon()}</div>
            <div className="mic-label">{getStatusText()}</div>
            <div className={`mic-ring ${processingStep}`}></div>
          </div>
        ) : (
          <>
            {getStatusIcon()}
            <span className={'hidden sm:inline'}>{getStatusText()}</span>
          </>
        )}
      </button>
      
      {/* Lightweight transcript view */}
      {messages.length > 0 && (
        <div className={`flex-col gap-1 text-xs ${large ? 'flex max-w-full' : 'hidden md:flex max-w-80'}`}>
          {messages.slice(-4).map((m, idx) => (
            <div key={idx} className={`transcript-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
              <span className="who">{m.role === 'user' ? 'You' : 'AI'}:</span>
              <span className="text">{m.content}</span>
            </div>
          ))}
        </div>
      )}

      {transcript && (
        <div className="transcript-live">🎤 {transcript}</div>
      )}
      
      {lastCommand && processingStep === 'success' && (
        <div className="text-xs text-green-600 max-w-48 truncate">
          ✓ {lastCommand.type} {lastCommand.quantity || ''} {lastCommand.edition || ''} {lastCommand.player_name || ''}
        </div>
      )}
      
      {apiError && (
        <div className="text-xs text-yellow-600 max-w-64 truncate">
          ⚠️ OpenAI API credits exhausted. Using browser speech recognition.
        </div>
      )}
      
      <div className="text-xs text-gray-500 hidden md:block">
        Try: "Add 5 Jalen Green Icon size 48" · "Remove 3 Statement jerseys" · "Set Jalen Green Icon to 10" · "Delete all City jerseys"
      </div>
    </div>
  );
}