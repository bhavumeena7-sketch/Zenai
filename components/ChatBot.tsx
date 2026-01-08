
import React, { useState, useRef, useEffect } from 'react';
import { getSmartChat, transcribeAudio } from '../services/gemini';
import { ChatMessage } from '../types';
import Button from './Button';

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', content: "Namaste. I am ZenCoach. How can I assist your mindfulness journey?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const [useGrounding, setUseGrounding] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (text?: string) => {
    const messageToSend = text || input;
    if (!messageToSend.trim() || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: messageToSend }]);
    setIsLoading(true);

    try {
      const res = await getSmartChat(messageToSend, useThinking, useGrounding);
      setMessages(prev => [...prev, { role: 'model', content: res.text, groundingUrls: res.urls }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: "Connection to the universe lost. Try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
      setIsLoading(true);
      try {
        const text = await transcribeAudio(blob);
        handleSend(text);
      } finally {
        setIsLoading(false);
      }
    };
    recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="glass w-80 md:w-96 h-[600px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-white/20">
          <div className="p-4 bg-indigo-600 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> ZenCoach AI
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">✕</button>
          </div>

          <div className="p-2 flex gap-2 border-b border-white/10 bg-black/20">
            <button 
              onClick={() => setUseThinking(!useThinking)}
              className={`flex-1 text-[10px] py-1 rounded transition-colors ${useThinking ? 'bg-amber-500/30 text-amber-300' : 'bg-white/5 text-slate-500'}`}
            >
              Deep Thinking
            </button>
            <button 
              onClick={() => setUseGrounding(!useGrounding)}
              className={`flex-1 text-[10px] py-1 rounded transition-colors ${useGrounding ? 'bg-cyan-500/30 text-cyan-300' : 'bg-white/5 text-slate-500'}`}
            >
              Web Search
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/10 text-slate-200 rounded-tl-none'}`}>
                  {m.content}
                  {m.groundingUrls && m.groundingUrls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] space-y-1">
                      <p className="font-bold text-slate-400">Sources:</p>
                      {m.groundingUrls.map((u, ui) => (
                        <a key={ui} href={u.uri} target="_blank" className="block text-indigo-400 hover:underline truncate">{u.title}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-slate-500 text-xs italic">ZenCoach is channeling wisdom...</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 border-t border-white/10 flex gap-2">
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}
            >
              🎤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="submit" disabled={isLoading} className="px-3">Send</Button>
          </form>
        </div>
      ) : (
        <button onClick={() => setIsOpen(true)} className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
          💬
        </button>
      )}
    </div>
  );
};

export default ChatBot;
