
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { encodeBase64, decodeBase64, decodeAudioData } from '../services/gemini';
import Button from './Button';

const LiveSession: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const startSession = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);
          setIsActive(true);
        },
        onmessage: async (msg: any) => {
          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64 && audioContextRef.current) {
            const buffer = await decodeAudioData(decodeBase64(base64), audioContextRef.current);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }
          if (msg.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => s.stop());
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: "You are ZenLive. Provide peaceful real-time mindfulness coaching."
      }
    });
    sessionRef.current = await sessionPromise;
  };

  useEffect(() => {
    startSession();
    return () => {
      sessionRef.current?.close();
      audioContextRef.current?.close();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] glass flex items-center justify-center">
      <div className="bg-slate-900/90 p-12 rounded-[3rem] border border-indigo-500/30 flex flex-col items-center gap-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center ${isActive ? 'bg-indigo-600 animate-pulse' : 'bg-slate-800'}`}>
           <div className="w-24 h-24 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">ZenLive Session</h2>
          <p className="text-slate-400">Speak freely. Your guide is listening.</p>
        </div>
        <Button variant="danger" onClick={onClose} className="px-8 py-3 rounded-full">End Session</Button>
      </div>
    </div>
  );
};

export default LiveSession;
