import { useEffect, useRef, useState } from 'react';
import { transcribeAudio, interpretVoiceCommandWithAI, type VoiceCommand } from '../../integrations/openai';
import { interpretVoiceCommand } from '../../integrations/voiceflow';
import type { JerseyItem } from '../../types';
import { Mic, Volume2, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  rows: JerseyItem[];
  onAction: (command: VoiceCommand) => void | Promise<void>;
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

  useEffect(() => {
    // Check for MediaRecorder support (required for OpenAI Whisper)
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const hasSpeechRecognition = typeof (window as any).SpeechRecognition !== 'undefined' || typeof (window as any).webkitSpeechRecognition !== 'undefined';
    
    console.log('MediaRecorder support:', hasMediaRecorder);
    console.log('getUserMedia support:', hasGetUserMedia);
    console.log('SpeechRecognition support:', hasSpeechRecognition);
    
    if (!hasMediaRecorder && !hasSpeechRecognition) {
      console.warn('No voice recording support available');
      setSupported(false);
      return;
    }
    
    setSupported(true);
  }, []);

  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('Browser speech recognition not supported');
      setProcessingStep('error');
      return;
    }
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      
      recognition.onstart = () => {
        setListening(true);
        setProcessingStep('recording');
        setTranscript(''); // Clear previous transcript
        playBeep();
        console.log('Browser speech recognition started');
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
      };
      
      recognition.onerror = (event: any) => {
        console.error('Browser speech recognition error:', event.error);
        setListening(false);
        setProcessingStep('error');
        setTimeout(() => setProcessingStep('idle'), 3000);
      };
      
      recognition.start();
    } catch (error) {
      console.error('Failed to start browser speech recognition:', error);
      setProcessingStep('error');
    }
  };

  const processVoiceCommand = async (transcript: string) => {
    if (!transcript.trim()) return;
    
    setIsProcessing(true);
    setProcessingStep('interpreting');
    
    try {
      // Check if we have OpenAI API key for command interpretation
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      let command: VoiceCommand;
      
      if (apiKey) {
        // Use OpenAI for command interpretation
        command = await interpretVoiceCommandWithAI(transcript, rows);
      } else {
        // Use simple local interpretation as fallback
        const intent = await interpretVoiceCommand(transcript);
        command = convertVoiceCommandResultToVoiceCommand(intent);
      }
      
      setLastCommand(command);
      setProcessingStep('executing');
      
      // Execute the command directly
      await onAction(command);
      
      setProcessingStep('success');
      setTimeout(() => {
        setProcessingStep('idle');
        setLastCommand(null);
      }, 2000);
      
    } catch (error) {
      console.error('Voice command processing error:', error);
      setProcessingStep('error');
      setTimeout(() => {
        setProcessingStep('idle');
      }, 3000);
    } finally {
      setIsProcessing(false);
      setListening(false);
      setTranscript('');
    }
  };

  const convertVoiceCommandResultToVoiceCommand = (intent: any): VoiceCommand => {
    return {
      type: intent.type === 'adjust' ? (intent.qty_inventory_delta > 0 ? 'add' : 'remove') : 
            intent.type === 'order' ? 'order' : 
            intent.type === 'giveaway' ? 'turn_in' : 
            intent.type === 'set' ? 'set' : 
            intent.type === 'delete' ? 'delete' : 'unknown',
      player_name: intent.player_name,
      edition: intent.edition,
      size: intent.size,
      quantity: Math.abs(intent.qty_inventory_delta || intent.order_quantity || intent.giveaway_quantity || 0),
      target_quantity: intent.set_inventory_to,
      recipient: intent.recipient,
    };
  };

  const startListening = async () => {
    if (listening) return;
    
    console.log('Starting voice recording...');
    
    // Check if we should use browser speech recognition directly
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.log('No OpenAI API key found, using browser speech recognition directly');
      setApiError('OpenAI API credits exhausted. Using browser speech recognition.');
      startBrowserSpeechRecognition();
      return;
    }
    
    // Try OpenAI Whisper with MediaRecorder first
    if (typeof MediaRecorder !== 'undefined') {
      try {
        console.log('Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          } 
        });
        
        console.log('Microphone access granted, starting recording...');
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
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
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
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
                
                // Try fallback to browser speech recognition
                setTimeout(() => {
                  startBrowserSpeechRecognition();
                }, 1000); // Small delay to ensure cleanup
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
        console.log('Recording started successfully');
        
      } catch (error) {
        console.error('Failed to start audio recording:', error);
        setProcessingStep('error');
        
        // Check for specific error types
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            console.error('Microphone access denied by user');
          } else if (error.name === 'NotFoundError') {
            console.error('No microphone found');
          } else if (error.name === 'NotSupportedError') {
            console.error('Audio recording not supported');
          }
        }
      }
    } else {
      // Fallback to browser speech recognition
      console.log('MediaRecorder not available, trying browser speech recognition...');
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.interimResults = true;
          recognition.continuous = false;
          
          recognition.onstart = () => {
            setListening(true);
            setProcessingStep('recording');
            playBeep();
            console.log('Browser speech recognition started');
          };
          
          recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            console.log('Browser transcript:', transcript);
            setTranscript(transcript);
            
            if (event.results[0].isFinal) {
              await processVoiceCommand(transcript);
            }
          };
          
          recognition.onend = () => {
            setListening(false);
            setProcessingStep('idle');
          };
          
          recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            setListening(false);
            setProcessingStep('error');
            setTimeout(() => setProcessingStep('idle'), 3000);
          };
          
          recognition.start();
        } catch (error) {
          console.error('Failed to start browser speech recognition:', error);
          setProcessingStep('error');
        }
      } else {
        console.error('No voice recording support available');
        setProcessingStep('error');
      }
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
          Check browser console for details
        </div>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (processingStep) {
      case 'recording':
        return <Mic className="h-4 w-4 animate-pulse" />;
      case 'transcribing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'interpreting':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'executing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
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
        
      </div>
      
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


