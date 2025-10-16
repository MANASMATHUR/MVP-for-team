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
    console.log('=== SPEECH SYNTHESIS DEBUG ===');
    console.log('Text to speak:', text);
    console.log('Browser:', navigator.userAgent);
    
    // Check if speech synthesis is available globally
    if (typeof window.speechSynthesis === 'undefined') {
      console.error('Speech synthesis not supported in this browser');
      alert('Speech synthesis is not supported in this browser. Please use Chrome, Edge, or Safari for voice functionality.');
      return;
    }
    
    // Mobile-specific speech synthesis handling
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Mobile device detected for speech synthesis');
      // Mobile browsers may require user interaction for speech synthesis
      // We'll try anyway since this is called after user interaction
    }
    
    const speechSynthesis = window.speechSynthesis;
    if (!speechSynthesis) {
      console.error('Speech synthesis not available');
      alert('Speech synthesis is not available. Please refresh the page and try again.');
      return;
    }
    
    // Check if speech synthesis is speaking
    if (speechSynthesis.speaking) {
      console.log('Speech synthesis is already speaking, cancelling...');
      speechSynthesis.cancel();
    }
    
    // Wait a moment for cancellation
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.8;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = 'en-US';
        
        // Add event listeners for debugging
        utterance.onstart = () => {
          console.log('✅ Speech started successfully');
        };
        
        utterance.onend = () => {
          console.log('✅ Speech ended successfully');
        };
        
        utterance.onerror = (event) => {
          console.error('❌ Speech error:', event.error, event);
          alert(`Speech synthesis error: ${event.error}. Please try:\n1. Refresh the page\n2. Use Chrome, Edge, or Safari\n3. Check your browser's speech settings\n4. Ensure your system volume is on`);
        };
        
        // Try to get a good voice, but don't fail if none found
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          // Try to find an English voice
          const englishVoice = voices.find(voice => voice.lang.startsWith('en'));
          if (englishVoice) {
            utterance.voice = englishVoice;
            console.log('Using English voice:', englishVoice.name);
          } else {
            console.log('Using default voice');
          }
        }
        
        console.log('Attempting to speak...');
        speechSynthesis.speak(utterance);
        console.log('speak() called successfully');
        
        // Verify speech started after a short delay (mobile-optimized)
        setTimeout(() => {
          if (!speechSynthesis.speaking) {
            console.warn('Speech may not have started, trying again...');
            if (isMobile) {
              console.log('Mobile retry: Attempting speech synthesis again...');
              // Mobile browsers sometimes need multiple attempts
              speechSynthesis.speak(utterance);
              
              // If still not working after 1 second, try again
              setTimeout(() => {
                if (!speechSynthesis.speaking) {
                  console.log('Mobile second retry...');
                  speechSynthesis.speak(utterance);
                }
              }, 1000);
              
              // Final attempt after 3 seconds
              setTimeout(() => {
                if (!speechSynthesis.speaking) {
                  console.log('Mobile final retry: Last attempt for speech synthesis...');
                  speechSynthesis.speak(utterance);
                }
              }, 3000);
            } else {
              speechSynthesis.speak(utterance);
            }
          }
        }, 500);
        
      } catch (error) {
        console.error('Error creating utterance:', error);
        alert(`Failed to create speech utterance: ${error}. Please refresh the page and try again.`);
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
        return `Ok, deleted ${command.edition || ''} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.size ? ` size ${command.size}` : ''} from inventory.`;
      case 'order':
        return `Ok, order placed for ${command.quantity || 0} ${command.edition || ''} jerseys${command.size ? ` size ${command.size}` : ''}.`;
      case 'turn_in':
        return `Ok, turned in ${command.quantity || 0} jerseys${command.player_name ? ` for ${command.player_name}` : ''}${command.recipient ? ` to ${command.recipient}` : ''}.`;
      default:
        return "Ok, command executed successfully.";
    }
  };

  useEffect(() => {
    // Check for MediaRecorder support (required for OpenAI Whisper)
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const hasSpeechRecognition = typeof (window as any).SpeechRecognition !== 'undefined' || typeof (window as any).webkitSpeechRecognition !== 'undefined';
    const hasSpeechSynthesis = typeof speechSynthesis !== 'undefined';
    
    // Check if we're on HTTPS (required for microphone access on mobile)
    const isSecureContext = window.isSecureContext || location.protocol === 'https:';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isSecure = isSecureContext || isLocalhost;
    
    console.log('MediaRecorder support:', hasMediaRecorder);
    console.log('getUserMedia support:', hasGetUserMedia);
    console.log('SpeechRecognition support:', hasSpeechRecognition);
    console.log('SpeechSynthesis support:', hasSpeechSynthesis);
    console.log('Secure context:', isSecure);
    console.log('Protocol:', location.protocol);
    console.log('User agent:', navigator.userAgent);
    
    if (!isSecure) {
      console.warn('Microphone access requires HTTPS on mobile devices');
      setSupported(false);
      return;
    }
    
    if (!hasMediaRecorder && !hasSpeechRecognition) {
      console.warn('No voice recording support available');
      setSupported(false);
      return;
    }
    
    // Initialize speech synthesis
    if (hasSpeechSynthesis) {
      console.log('Initializing speech synthesis...');
      setSpeechSynthesis(window.speechSynthesis);
      
      // Load voices if they're not already loaded
      const speechSynthesis = window.speechSynthesis;
      if (speechSynthesis) {
        const voices = speechSynthesis.getVoices();
        console.log('Initial voices count:', voices.length);
        
        if (voices.length === 0) {
          console.log('No voices loaded yet, waiting for voiceschanged event...');
          speechSynthesis.addEventListener('voiceschanged', () => {
            const newVoices = speechSynthesis.getVoices();
            console.log('Voices loaded after event:', newVoices.length);
            console.log('Available voices:', newVoices.map(v => v.name));
          });
        } else {
          console.log('Voices already loaded:', voices.map(v => v.name));
        }
        
        // Speech synthesis is ready
        console.log('Speech synthesis initialized successfully');
        
        // Mobile-specific speech synthesis setup
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          console.log('Mobile device detected, setting up mobile speech synthesis...');
          // Mobile browsers sometimes need a test utterance to initialize properly
          try {
            const testUtterance = new SpeechSynthesisUtterance('');
            testUtterance.volume = 0;
            speechSynthesis.speak(testUtterance);
            console.log('Mobile speech synthesis test completed');
          } catch (error) {
            console.log('Mobile speech synthesis test failed:', error);
          }
        }
      }
    } else {
      console.log('Speech synthesis not supported');
      alert('Speech synthesis is not supported in this browser. Please use Chrome, Edge, or Safari.');
    }
    
    setSupported(true);
  }, []);

  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('Browser speech recognition not supported');
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
      
      // Mobile-specific optimizations
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        console.log('Applying mobile-specific speech recognition settings...');
        // Mobile browsers work better with these settings
        recognition.continuous = false; // Use false for better mobile compatibility
        recognition.interimResults = true; // Show interim results for better UX
        recognition.maxAlternatives = 3; // Get more alternatives for better recognition
      }
      
      recognition.onstart = () => {
        setListening(true);
        setProcessingStep('recording');
        setTranscript(''); // Clear previous transcript
        playBeep();
        // Only speak greeting once per session (mobile-friendly)
        if (!hasSpokenGreeting) {
          setTimeout(() => {
            console.log('Speaking greeting...');
            // On mobile, ensure user interaction before speaking
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) {
              // Mobile browsers require user interaction for speech synthesis
              console.log('Mobile detected, greeting will be spoken after user interaction');
              // Try multiple times for mobile
              speak(getGreetingMessage());
              // Backup attempt after 1 second
              setTimeout(() => {
                if (!hasSpokenGreeting) {
                  console.log('Mobile greeting backup attempt...');
                  speak(getGreetingMessage());
                }
              }, 1000);
            } else {
              speak(getGreetingMessage());
            }
            setHasSpokenGreeting(true);
          }, 500);
        }
        console.log('Browser speech recognition started');
      };
      
      recognition.onresult = async (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        console.log('Speech recognition result received:', event);
        console.log('Number of results:', event.results.length);
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence;
          console.log(`Result ${i}: "${transcript}" (confidence: ${confidence}, final: ${event.results[i].isFinal})`);
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Show interim results as user speaks
        if (interimTranscript) {
          console.log('Interim transcript:', interimTranscript);
          setTranscript(interimTranscript);
        }
        
        // Process final results
        if (finalTranscript) {
          console.log('Final transcript:', finalTranscript);
          setTranscript(finalTranscript);
          console.log('Transcript state updated, should show in UI');
          await processVoiceCommand(finalTranscript);
        }
      };
      
      recognition.onend = () => {
        setListening(false);
        setProcessingStep('idle');
        console.log('Browser speech recognition ended');
        // Reset greeting flag after a delay to allow new sessions
        setTimeout(() => setHasSpokenGreeting(false), 30000); // Reset after 30 seconds
      };
      
      recognition.onerror = (event: any) => {
        console.error('Browser speech recognition error:', event.error);
        console.error('Error details:', event);
        setListening(false);
        setProcessingStep('error');
        
        // Handle specific error types with mobile-friendly messages
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please:\n1. Allow microphone permission in your browser\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
        } else if (event.error === 'no-speech') {
          console.log('No speech detected, trying again...');
          setTimeout(() => setProcessingStep('idle'), 1000);
        } else if (event.error === 'audio-capture') {
          alert('No microphone found. Please:\n1. Check your microphone is connected\n2. Make sure no other app is using the microphone\n3. Try refreshing the page');
        } else if (event.error === 'network') {
          alert('Network error. Please check your internet connection and try again.');
        } else if (event.error === 'service-not-allowed') {
          alert('Speech recognition service not allowed. Please:\n1. Use Chrome or Safari\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
        } else {
          console.log('Speech recognition error, retrying...');
          setTimeout(() => setProcessingStep('idle'), 2000);
        }
      };
      
      recognition.start();
    } catch (error) {
      console.error('Failed to start browser speech recognition:', error);
      setProcessingStep('error');
      
      // Mobile-specific fallback message
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        alert('Speech recognition failed on mobile. Please:\n1. Use Chrome or Safari\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page\n4. Check microphone permissions');
      }
    }
  };

  const processVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;
    
    console.log('=== PROCESSING VOICE COMMAND ===');
    console.log('Raw transcript:', transcript);
    console.log('Transcript length:', transcript.length);
    console.log('Has OpenAI API key:', !!import.meta.env.VITE_OPENAI_API_KEY);
    
    setIsProcessing(true);
    setProcessingStep('interpreting');
    
    try {
      // Check if we have OpenAI API key for command interpretation
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      let command: VoiceCommand;
      
      if (apiKey) {
        console.log('Using OpenAI for command interpretation');
        // Use OpenAI for command interpretation
        command = await interpretVoiceCommandWithAI(transcript, rows);
        if (!command || command.type === 'unknown') {
          console.log('AI interpretation unknown, falling back to local interpretation');
          command = interpretVoiceCommandLocal(transcript);
        }
      } else {
        console.log('Using local interpretation (no OpenAI API key)');
        // Use simple local interpretation as fallback
        command = interpretVoiceCommandLocal(transcript);
      }
      
      console.log('Final interpreted command:', command);
      setLastCommand(command);
      setProcessingStep('executing');
      
      console.log('Executing voice command:', command);
      console.log('Command type:', command.type);
      console.log('Command details:', JSON.stringify(command, null, 2));
      
      // Execute the command and verify success
      const succeeded = await Promise.resolve(onAction(command));
      
      if (succeeded) {
        setProcessingStep('success');
        // Speak confirmation message immediately
        const confirmationMessage = getConfirmationMessage(command);
        speak(confirmationMessage);
      } else {
        setProcessingStep('error');
      }
      
      // Wait longer for user to respond after confirmation
      setTimeout(() => {
        setProcessingStep('idle');
        setLastCommand(null);
      }, 3000);
      
    } catch (error) {
      console.error('Voice command processing error:', error);
      setProcessingStep('error');
      // Don't speak on errors, just show error state briefly
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
    console.log('=== LOCAL VOICE INTERPRETATION ===');
    console.log('Transcript:', transcript);
    console.log('Lower transcript:', lowerTranscript);
    
    // Mobile-specific transcript cleaning
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Mobile device detected, applying mobile-specific transcript processing...');
      // Mobile speech recognition sometimes adds extra words or has different patterns
    }
    
    // Enhanced pattern matching for better recognition
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
          // Filter out common words that aren't player names
          if (!['jersey', 'jerseys', 'size', 'edition', 'icon', 'statement', 'association', 'city', 'to', 'for', 'of', 'the'].includes(name.toLowerCase())) {
            return name;
          }
        }
      }
      return '';
    };

    const normalizeEdition = (s?: string) => {
      if (!s) return s;
      const singular = s.replace(/s\b/, ''); // tolerate plural 'statements'
      const lowerSingular = singular.toLowerCase();
      console.log('Normalizing edition:', s, '->', lowerSingular);
      
      // More flexible matching for all editions
      if (/icon/.test(lowerSingular)) return 'Icon';
      if (/statement/.test(lowerSingular)) return 'Statement';
      if (/association/.test(lowerSingular)) return 'Association';
      if (/city/.test(lowerSingular)) return 'City';
      
      console.log('No edition match found for:', lowerSingular);
      return undefined;
    };

    // Check for delete commands: "delete 5 city jerseys", "delete jalen green icon", "clear association"
    if (/(^|\s)(delete|remove all|clear)(\s|$)/i.test(lowerTranscript)) {
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

    // Check for add/increase commands (mobile-optimized patterns)
    if (lowerTranscript.includes('add') || lowerTranscript.includes('plus') || lowerTranscript.includes('increase') || lowerTranscript.includes('inc ') || lowerTranscript.includes('more') || lowerTranscript.includes('additional') || lowerTranscript.includes('put') || lowerTranscript.includes('place') || lowerTranscript.includes('create')) {
      const qtyMatch = lowerTranscript.match(/(\d+)/);
      // More comprehensive regex for all editions
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);
      
      console.log('Add command detected:');
      console.log('  Quantity match:', qtyMatch);
      console.log('  Edition match:', editionMatch);
      console.log('  Size match:', sizeMatch);
      console.log('  Player name:', playerName);
      
      const command = {
        type: 'add' as const,
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        quantity: parseInt(qtyMatch?.[1] || '1', 10),
      };
      
      console.log('Generated command:', command);
      return command;
    }

    // Check for remove/decrease commands (mobile-optimized patterns)
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

    // Check for set/update commands
    if ((lowerTranscript.includes('set') || lowerTranscript.includes('update')) && lowerTranscript.includes('to')) {
      const editionMatch = lowerTranscript.match(/(icon|icons?|statement|statements?|association|associations?|city|cities)/i);
      const sizeToMatch = lowerTranscript.match(/size\s+to\s+(\d+)/i); // e.g., "update icon jersey size to 32"
      const sizeMatch = lowerTranscript.match(/size\s+(\d+)/i);
      const toMatch = lowerTranscript.match(/\bto\s+(\d+)/i);
      const playerName = extractPlayerName(transcript);

      if (sizeToMatch) {
        // Intent: set SIZE to a value
        return {
          type: 'set',
          player_name: playerName,
          edition: normalizeEdition(editionMatch?.[1]),
          size: sizeToMatch?.[1],
          notes: 'set_size',
        };
      }
      
      // Otherwise: set inventory to a target quantity
      return {
        type: 'set',
        player_name: playerName,
        edition: normalizeEdition(editionMatch?.[1]),
        size: sizeMatch?.[1],
        target_quantity: parseInt(toMatch?.[1] || '0', 10),
      };
    }

    // Check for order commands
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

    console.log('No command pattern matched, returning unknown');
    console.log('Final transcript analysis:', {
      lowerTranscript,
      hasAdd: lowerTranscript.includes('add'),
      hasPlus: lowerTranscript.includes('plus'),
      hasRemove: lowerTranscript.includes('remove'),
      hasDelete: lowerTranscript.includes('delete'),
      hasSet: lowerTranscript.includes('set'),
      hasOrder: lowerTranscript.includes('order'),
      hasTurnIn: lowerTranscript.includes('turn in') || lowerTranscript.includes('turnin'),
    });
    return { type: 'unknown' };
  };

  const startListening = async () => {
    if (listening) return;
    
    console.log('Starting voice recording...');
    
    // Check if we're on a mobile device and require user interaction
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Mobile device detected, ensuring user interaction...');
      // Mobile browsers require user interaction before microphone access
      // This function is called from a button click, so we should be good
      
      // MOBILE GREETING: Try to speak greeting immediately on mobile
      if (!hasSpokenGreeting) {
        console.log('Mobile: Attempting immediate greeting...');
        speak(getGreetingMessage());
        setHasSpokenGreeting(true);
      }
    }
    
    // Check if we should use browser speech recognition directly
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.log('No OpenAI API key found, using browser speech recognition directly');
      setApiError('OpenAI API credits exhausted. Using browser speech recognition.');
      startBrowserSpeechRecognition();
      return;
    }
    
    // If we already have an API error, use browser speech recognition
    if (apiError) {
      console.log('API error detected, using browser speech recognition');
      startBrowserSpeechRecognition();
      return;
    }
    
    // Reset any previous errors when starting fresh
    setApiError(null);
    
    // MOBILE-FIRST APPROACH: Try OpenAI Whisper first, fallback to browser speech recognition
    console.log('Mobile-optimized: Trying OpenAI Whisper first, with browser fallback');
    
    // Try OpenAI Whisper with MediaRecorder first
    if (typeof MediaRecorder !== 'undefined') {
      try {
        console.log('Requesting microphone access...');
        
        // Mobile-friendly audio constraints
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        
        // Add sample rate only if supported (some mobile browsers don't support it)
        if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android') || navigator.userAgent.includes('iPhone')) {
          // For mobile, use simpler constraints
          console.log('Mobile device detected, using simplified audio constraints');
        } else {
          audioConstraints.sampleRate = 44100;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints
        });
        
        console.log('Microphone access granted, starting recording...');
        
        // Check for supported MIME types (mobile browsers have limited support)
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
            console.log('Using MIME type:', mimeType);
            break;
          }
        }
        
        console.log('Selected MIME type:', selectedMimeType);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            console.log('Audio data received:', event.data.size, 'bytes');
          }
        };
        
        mediaRecorder.onstop = async () => {
          console.log('Recording stopped, processing audio...');
          setProcessingStep('transcribing');
          const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
          
          try {
            console.log('Sending audio to OpenAI Whisper...');
            const transcript = await transcribeAudio(audioBlob);
            console.log('Transcript received:', transcript);
            setTranscript(transcript);
            await processVoiceCommand(transcript);
          } catch (error) {
            console.error('OpenAI transcription error:', error);
            setProcessingStep('error');
            
            // Check for specific API errors
            if (error instanceof Error) {
              if (error.message.includes('insufficient credits') || error.message.includes('payment required')) {
                console.error('OpenAI API credits exhausted - falling back to browser speech recognition');
                setApiError('OpenAI API credits exhausted. Using browser speech recognition.');
                
                // Clean up the current stream first
                stream.getTracks().forEach(track => track.stop());
                setListening(false);
                setProcessingStep('idle');
                
                // Automatically fallback to browser speech recognition so user doesn't have to click again
                setTimeout(() => {
                  console.log('Auto-starting browser speech recognition after credit error...');
                  startBrowserSpeechRecognition();
                }, 300);
                return; // Exit early to avoid the setTimeout below
              }
            }
            
            setTimeout(() => setProcessingStep('idle'), 3000);
          }
          
          // Clean up
          stream.getTracks().forEach(track => track.stop());
          setListening(false);
        };
        
        mediaRecorder.start();
        setListening(true);
        setProcessingStep('recording');
        playBeep();
        // Only speak greeting once per session (mobile-optimized)
        if (!hasSpokenGreeting) {
          setTimeout(() => {
            console.log('Speaking greeting...');
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (isMobile) {
              console.log('Mobile greeting attempt...');
              // Try multiple times for mobile
              speak(getGreetingMessage());
              // Backup attempt after 1 second
              setTimeout(() => {
                console.log('Mobile greeting backup attempt...');
                speak(getGreetingMessage());
              }, 1000);
            } else {
              speak(getGreetingMessage());
            }
            setHasSpokenGreeting(true);
          }, 500);
        }
        console.log('Recording started successfully');
        
      } catch (error) {
        console.error('Failed to start audio recording:', error);
        setProcessingStep('error');
        
        // Check for specific error types and provide mobile-friendly messages
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            console.error('Microphone access denied by user');
            alert('Microphone access denied. Please:\n1. Allow microphone permission in your browser\n2. Make sure you\'re using HTTPS\n3. Try refreshing the page');
          } else if (error.name === 'NotFoundError') {
            console.error('No microphone found');
            alert('No microphone found. Please:\n1. Check your microphone is connected\n2. Make sure no other app is using the microphone\n3. Try refreshing the page');
          } else if (error.name === 'NotSupportedError') {
            console.error('Audio recording not supported');
            alert('Audio recording not supported on this device. Please:\n1. Use a modern browser (Chrome, Safari, Firefox)\n2. Make sure you\'re using HTTPS\n3. Try on a different device');
          } else if (error.name === 'SecurityError') {
            console.error('Security error - likely HTTPS required');
            alert('Security error: This feature requires HTTPS. Please:\n1. Make sure you\'re using https:// in the URL\n2. Try refreshing the page\n3. Contact support if the issue persists');
          }
        }
        
        // MOBILE FALLBACK: If MediaRecorder fails, automatically try browser speech recognition
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          console.log('Mobile MediaRecorder failed, automatically trying browser speech recognition...');
          setTimeout(() => {
            startBrowserSpeechRecognition();
          }, 1000);
        }
      }
      } else {
        // Fallback to browser speech recognition
        console.log('MediaRecorder not available, trying browser speech recognition...');
        startBrowserSpeechRecognition();
      }
  };

  const stopListening = () => {
    if (!listening) return;
    
    console.log('Stopping voice recording...');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      // For browser speech recognition, we can't manually stop it
      // It will stop automatically when it detects speech end
      console.log('Browser speech recognition will stop automatically');
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


