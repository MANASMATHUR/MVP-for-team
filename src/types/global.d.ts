// Minimal Web Speech API types to satisfy TypeScript during build
// These are intentionally loose for cross-browser support
type SpeechRecognition = any;
type SpeechRecognitionEvent = any;

interface Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}


