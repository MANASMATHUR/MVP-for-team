import { useEffect, useRef, useState } from 'react';
import { transcribeAudio, interpretVoiceCommandWithAI, type VoiceCommand } from '../../integrations/openai';
import type { JerseyItem } from '../../types';
import { Mic, Volume2, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  rows: JerseyItem[];
  onAction: (command: VoiceCommand) => Promise<boolean> | boolean;
}

export function VoiceMic({ rows, onAction }: Props) {
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
  const [hasSpokenGreeting, setHasSpokenGreeting] = useState(false);

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
      speechSynthesis.cancel();
    }
    
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.8;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = 'en-US';
        
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          const englishVoice = voices.find(voice => voice.lang.startsWith('en'));
          if (englishVoice) {
            utterance.voice = englishVoice;
          }
        }
        
        speechSynthesis.speak(utterance);
        
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

  const getGreetingMessage = () => {
    const greetings = [
      "Hello! How are you?",
      "Hi there! How are you?",
      "Hello! How are you?",
      "Hi! How are you?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  };

  const getConfirmationMessage = (command: VoiceCommand) => {
    switch (command.type) {
      case 'add':
        return `Ok, added ${command.quantity || 0} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} to inventory.`;
      case 'remove':
        return `Ok, removed ${command.quantity || 0} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} from inventory.`;
      case 'set':
        return `Ok, set ${command.player_name || ''} ${command.edition || ''} jerseys${command.size ? ` size ${command.size}` : ''} to ${command.target_quantity || 0} in inventory.`;
      case 'delete':
        return `Ok, removed ${command.quantity || 0} ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} from inventory.`;
      case 'order':
        return `Ok, order placed for ${command.quantity || 0} ${command.edition || ''} jerseys${command.size ? ` size ${command.size}` : ''}.`;
      case 'turn_in':
        return `Ok, turned in ${command.quantity || 0} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.recipient ? ` to ${command.recipient}` : ''}.`;
      default:
        return "Ok, command executed successfully.";
    }
  };

  const isGeneralChat = (transcript: string): boolean => {
    const lowerTranscript = transcript.toLowerCase();
    
    // Check for general conversation patterns
    const generalPatterns = [
      /^(hello|hi|hey|good morning|good afternoon|good evening)/i,
      /^(how are you|what's up|how's it going)/i,
      /^(thank you|thanks|appreciate it)/i,
      /^(goodbye|bye|see you later)/i,
      /^(what time|what's the time)/i,
      /^(what's the weather|how's the weather)/i,
      /^(tell me about|explain|what is)/i,
      /^(joke|funny|laugh)/i,
      /^(help|assist|support)/i,
      /^(yes|no|okay|ok|sure|alright)/i
    ];
    
    return generalPatterns.some(pattern => pattern.test(lowerTranscript));
  };

  const handleGeneralConversation = async (transcript: string): Promise<string> => {
    const lowerTranscript = transcript.toLowerCase();
    
    // Simple conversation responses
    if (lowerTranscript.includes('hello') || lowerTranscript.includes('hi') || lowerTranscript.includes('hey')) {
      return "Hello! I'm your inventory assistant. How can I help you manage your jerseys today?";
    }
    
    if (lowerTranscript.includes('how are you') || lowerTranscript.includes('what\'s up')) {
      return "I'm doing great! Ready to help you with inventory management. What would you like to do?";
    }
    
    if (lowerTranscript.includes('thank you') || lowerTranscript.includes('thanks')) {
      return "You're welcome! I'm here to help with your inventory. Anything else you need?";
    }
    
    if (lowerTranscript.includes('goodbye') || lowerTranscript.includes('bye')) {
      return "Goodbye! Feel free to come back anytime for inventory management.";
    }
    
    if (lowerTranscript.includes('help') || lowerTranscript.includes('assist')) {
      return "I can help you with inventory commands like: Add jerseys, Delete jerseys, Remove jerseys, Set quantities, and Order jerseys. Just tell me what you'd like to do!";
    }
    
    if (lowerTranscript.includes('what time')) {
      const now = new Date();
      return `The current time is ${now.toLocaleTimeString()}.`;
    }
    
    if (lowerTranscript.includes('joke') || lowerTranscript.includes('funny')) {
      const jokes = [
        "Why don't jerseys ever get cold? Because they're always in the closet!",
        "What do you call a jersey that's been to space? An astronaut jersey!",
        "Why did the jersey go to therapy? It had too many issues!"
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }
    
    // Default response for general conversation
    return "I'm your inventory assistant. I can help you manage jerseys with commands like 'Add 5 jerseys', 'Delete 3 city jerseys', or 'Set jerseys to 10'. What would you like to do?";
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
        
        // MOBILE GREETING: Always try to speak greeting on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          // Reset greeting flag for mobile
          setHasSpokenGreeting(false);
        }
        
        if (!hasSpokenGreeting) {
          setTimeout(() => {
            speak(getGreetingMessage());
            setHasSpokenGreeting(true);
          }, 500);
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
          await processVoiceCommand(finalTranscript);
        }
      };
      
      recognition.onend = () => {
        setListening(false);
        setProcessingStep('idle');
        setTimeout(() => setHasSpokenGreeting(false), 30000);
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

  const processVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;
    
    setIsProcessing(true);
    setProcessingStep('interpreting');
    
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      let command: VoiceCommand;
      
      // Check if it's a general conversation first
      const isGeneralConversation = isGeneralChat(transcript);
      
      if (isGeneralConversation) {
        // Handle general conversation
        setProcessingStep('executing');
        const response = await handleGeneralConversation(transcript);
        speak(response);
        setProcessingStep('success');
        setTimeout(() => {
          setProcessingStep('idle');
        }, 2000);
        return;
      }
      
      // Handle inventory commands
      if (apiKey) {
        command = await interpretVoiceCommandWithAI(transcript, rows);
        if (!command || command.type === 'unknown') {
          command = interpretVoiceCommandLocal(transcript);
        }
      } else {
        command = interpretVoiceCommandLocal(transcript);
      }
      
      setLastCommand(command);
      setProcessingStep('executing');
      
      const succeeded = await Promise.resolve(onAction(command));
      
      if (succeeded) {
        setProcessingStep('success');
        const confirmationMessage = getConfirmationMessage(command);
        speak(confirmationMessage);
      } else {
        setProcessingStep('error');
      }
      
      setTimeout(() => {
        setProcessingStep('idle');
        setLastCommand(null);
      }, 3000);
      
    } catch (error) {
      setProcessingStep('error');
      setTimeout(() => {
        setProcessingStep('idle');
      }, 2000);
    } finally {
      setIsProcessing(false);
      setListening(false);
      setTranscript('');
    }
  };

  const interpretVoiceCommandLocal = (transcript: string): VoiceCommand => {
    const lowerTranscript = transcript.toLowerCase();
    
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

    if (lowerTranscript.includes('delete') || lowerTranscript.includes('remove all') || lowerTranscript.includes('clear')) {
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const qtyMatch = lowerTranscript.match(/(\d+)/);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'delete',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    if (lowerTranscript.includes('add') || lowerTranscript.includes('plus') || lowerTranscript.includes('increase') || lowerTranscript.includes('inc ') || lowerTranscript.includes('more') || lowerTranscript.includes('additional') || lowerTranscript.includes('put') || lowerTranscript.includes('place') || lowerTranscript.includes('create')) {
      const qtyMatch = lowerTranscript.match(/(\d+)/);
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);
      
      return {
        type: 'add' as const,
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
    }

    if (lowerTranscript.includes('remove') || lowerTranscript.includes('subtract') || lowerTranscript.includes('minus') || lowerTranscript.includes('decrease') || lowerTranscript.includes('dec ') || lowerTranscript.includes('delete') || lowerTranscript.includes('take away') || lowerTranscript.includes('takeaway')) {
      const qtyMatch = lowerTranscript.match(/(\d+)/);
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
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

    return { type: 'unknown' };
  };

  const startListening = async () => {
    if (listening) return;
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // MOBILE GREETING: Always speak greeting on mobile when button is clicked
    if (isMobile) {
      // Reset greeting flag to allow greeting every time on mobile
      setHasSpokenGreeting(false);
      // Speak greeting immediately on mobile
      speak(getGreetingMessage());
      setHasSpokenGreeting(true);
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
          
          stream.getTracks().forEach(track => track.stop());
          setListening(false);
        };
        
        mediaRecorder.start();
        setListening(true);
        setProcessingStep('recording');
        playBeep();
        // MOBILE GREETING BACKUP: Ensure greeting plays on mobile
        if (!hasSpokenGreeting) {
          setTimeout(() => {
            speak(getGreetingMessage());
            setHasSpokenGreeting(true);
          }, 500);
        }
        
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

  const stopListening = () => {
    if (!listening) return;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
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
    <div className="flex items-center gap-2">
      <button
        className={`btn btn-sm ${
          listening 
            ? 'btn-error' 
            : isProcessing 
            ? 'btn-warning' 
            : 'btn-secondary'
        }`}
        onClick={listening ? stopListening : startListening}
        disabled={isProcessing}
      >
        {getStatusIcon()}
        <span className="hidden sm:inline">
          {getStatusText()}
        </span>
      </button>
      
      {transcript && (
        <div className="text-sm text-blue-600 max-w-64 truncate bg-blue-50 px-2 py-1 rounded">
          🎤 "{transcript}"
        </div>
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