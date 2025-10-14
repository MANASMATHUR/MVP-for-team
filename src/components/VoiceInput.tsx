// src/components/VoiceInput.tsx
import React, { useState, useEffect, useRef } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void; // callback to send recognized text
  placeholder?: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, placeholder }) => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("Speech Recognition API not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript(finalTranscript);
        onTranscript(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
  }, [onTranscript]);

  const handleToggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 p-3 border rounded-2xl shadow-md bg-white">
      <label className="text-gray-700 text-sm font-medium">{placeholder || "Speak something..."}</label>

      <div className="flex gap-2 items-center w-full">
        <input
          type="text"
          className="w-full border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your speech will appear here..."
        />
        <button
          onClick={handleToggleListening}
          className={`px-4 py-2 rounded-xl text-white transition-all ${
            listening ? "bg-red-500 animate-pulse" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {listening ? "Stop" : "🎤 Speak"}
        </button>
      </div>
    </div>
  );
};

export default VoiceInput;
