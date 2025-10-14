import { useState } from "react";
import VoiceInput from "../../components/VoiceInput";
import { supabase } from "../../lib/supabaseClient";

export default function Dashboard() {
  const [input, setInput] = useState("");

  const handleVoiceResult = async (text: string) => {
    setInput(text);
    
    // Example: if user says "add 10 jerseys", extract values dynamically later
    // For now, insert the text directly
    const { error } = await supabase
      .from("voice_logs")
      .insert([{ spoken_text: text }]);

    if (error) console.error("Error inserting into Supabase:", error);
    else console.log("Inserted voice text:", text);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Voice Data Entry Dashboard</h1>
      <VoiceInput onTranscript={handleVoiceResult} />
      <p className="mt-4 text-gray-700">Last Input: {input}</p>
    </div>
  );
}
