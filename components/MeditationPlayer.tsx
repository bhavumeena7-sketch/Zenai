
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { MeditationSession } from '../types';
import { decodeBase64, decodeAudioData } from '../services/gemini';
import Button from './Button';

interface PlayerProps {
  session: MeditationSession;
  onClose: () => void;
  externalCommand?: 'play' | 'pause' | 'stop' | null;
}

export interface PlayerHandle {
  togglePlay: () => void;
  stop: () => void;
}

const MeditationPlayer = forwardRef<PlayerHandle, PlayerProps>(({ session, onClose, externalCommand }, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useImperativeHandle(ref, () => ({
    togglePlay,
    stop: stopAudio
  }));

  useEffect(() => {
    if (externalCommand === 'play' && !isPlaying) togglePlay();
    if (externalCommand === 'pause' && isPlaying) togglePlay();
    if (externalCommand === 'stop') onClose();
  }, [externalCommand]);

  useEffect(() => {
    const initAudio = async () => {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      const audioData = decodeBase64(session.audioUrl);
      const audioBuffer = await decodeAudioData(audioData, audioCtx);
      setDuration(audioBuffer.duration);
    };

    initAudio();

    return () => {
      stopAudio();
    };
  }, [session.audioUrl]);

  const startAudio = async (fromTime = 0) => {
    if (!audioContextRef.current) return;
    
    const audioData = decodeBase64(session.audioUrl);
    const audioBuffer = await decodeAudioData(audioData, audioContextRef.current);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      if (isPlaying) setIsPlaying(false);
    };

    source.start(0, fromTime);
    sourceNodeRef.current = source;
    startTimeRef.current = audioContextRef.current.currentTime - fromTime;
    setIsPlaying(true);
    
    requestAnimationFrame(updateProgress);
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pausedTimeRef.current = audioContextRef.current!.currentTime - startTimeRef.current;
      stopAudio();
    } else {
      startAudio(pausedTimeRef.current);
    }
  };

  const updateProgress = () => {
    if (!audioContextRef.current || !isPlaying) return;
    
    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    setCurrentTime(elapsed);

    const segment = session.script.segments.find(s => elapsed >= s.startSecond && elapsed <= s.endSecond);
    setCurrentSubtitle(segment ? segment.text : "");

    if (elapsed >= duration) {
      stopAudio();
      setCurrentTime(duration);
      return;
    }
    
    animationFrameRef.current = requestAnimationFrame(updateProgress);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 transition-opacity duration-700 animate-in fade-in">
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-[20s] ease-linear transform scale-105"
        style={{ backgroundImage: `url(${session.imageUrl})`, filter: 'brightness(0.5)' }}
      />

      <div className="relative z-10 w-full max-w-4xl px-6 flex flex-col items-center text-center">
        <button 
          onClick={onClose}
          className="absolute -top-12 right-6 text-white/50 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h1 className="text-4xl md:text-6xl font-light mb-4 text-white drop-shadow-lg tracking-wide uppercase">
          {session.script.title}
        </h1>
        <p className="text-indigo-300 mb-12 uppercase tracking-[0.3em] font-medium text-sm">
          {session.theme}
        </p>

        <div className="min-h-[120px] mb-12 flex items-center justify-center px-4 max-w-2xl">
          <p className="text-xl md:text-2xl text-slate-200 font-light leading-relaxed italic animate-in slide-in-from-bottom-2 fade-in duration-500">
            {currentSubtitle}
          </p>
        </div>

        <div className="w-full space-y-8">
          <div className="w-full flex items-center gap-4">
            <span className="text-xs text-slate-400 font-mono w-12 text-right">
              {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
            </span>
            <div className="flex-1 h-1 bg-white/10 rounded-full relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-100"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 font-mono w-12 text-left">
              {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={togglePlay}
              className="w-20 h-20 rounded-full bg-white text-indigo-900 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform group"
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 ml-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MeditationPlayer;
