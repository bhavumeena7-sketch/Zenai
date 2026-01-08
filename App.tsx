
import React, { useState, useEffect, useRef } from 'react';
import { MeditationTheme, ImageSize, AspectRatio, VoiceName, MeditationSession } from './types';
import { generateScript, generateVisual, generateSpeech, generateVideo, analyzeMedia, processVoiceCommand, editVisual, fastResponse } from './services/gemini';
import Button from './components/Button';
import ChatBot from './components/ChatBot';
import MeditationPlayer from './components/MeditationPlayer';
import LiveSession from './components/LiveSession';

const ThemeMap: Record<string, MeditationTheme> = {
  'Forest': MeditationTheme.FOREST,
  'Ocean': MeditationTheme.OCEAN,
  'Space': MeditationTheme.SPACE,
  'Mountain': MeditationTheme.MOUNTAIN,
  'Zen': MeditationTheme.ZEN
};

const VoiceMap: Record<string, VoiceName> = {
  'Kore': VoiceName.KORE,
  'Puck': VoiceName.PUCK,
  'Charon': VoiceName.CHARON,
  'Fenrir': VoiceName.FENRIR,
  'Zephyr': VoiceName.ZEPHYR
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<MeditationTheme>(MeditationTheme.ZEN);
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [voice, setVoice] = useState<VoiceName>(VoiceName.ZEPHYR);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSession, setCurrentSession] = useState<MeditationSession | null>(null);
  const [loadingStep, setLoadingStep] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
  // Voice Command State
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [externalPlaybackCommand, setExternalPlaybackCommand] = useState<'play' | 'pause' | 'stop' | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => { checkApiKey(); }, []);
  const checkApiKey = async () => setHasKey(await (window as any).aistudio.hasSelectedApiKey());
  const handleOpenKey = async () => { await (window as any).aistudio.openSelectKey(); setHasKey(true); };

  const handleGenerate = async (type: 'image' | 'video', customTheme?: MeditationTheme, customVoice?: VoiceName) => {
    if (!hasKey) await handleOpenKey();
    setIsGenerating(true);
    const targetTheme = customTheme || theme;
    const targetVoice = customVoice || voice;
    try {
      setLoadingStep("Channelling the script...");
      const script = await generateScript(targetTheme);
      let mediaUrl = "";
      if (type === 'image') {
        setLoadingStep(`Painting ${imageSize} visuals at ${aspectRatio}...`);
        mediaUrl = await generateVisual(`Serene landscape: ${targetTheme}`, imageSize, aspectRatio);
      } else {
        setLoadingStep("Synthesizing cinematic meditation video (may take 2 mins)...");
        mediaUrl = await generateVideo(`Cinematic peaceful video of ${targetTheme}`);
      }
      setLoadingStep("Weaving the audio tapestry...");
      const audioUrl = await generateSpeech(script.fullText, targetVoice);
      setCurrentSession({ id: Math.random().toString(36).slice(2), theme: targetTheme, imageUrl: type === 'image' ? mediaUrl : '', videoUrl: type === 'video' ? mediaUrl : '', audioUrl, script, createdAt: Date.now() });
    } catch (e) { alert("The cosmic alignment failed. Please try again."); }
    finally { setIsGenerating(false); setLoadingStep(""); }
  };

  const handleAnimateImage = async () => {
    if (!currentSession?.imageUrl) return;
    setIsGenerating(true);
    setLoadingStep("Animating your image with Veo 3.1...");
    try {
      const videoUrl = await generateVideo(`Peaceful animation of this image`, currentSession.imageUrl);
      setCurrentSession({ ...currentSession, videoUrl });
    } catch (e) { alert("Video generation failed."); }
    finally { setIsGenerating(false); setLoadingStep(""); }
  };

  const handleEditImage = async () => {
    if (!currentSession?.imageUrl || !editPrompt) return;
    setIsEditing(true);
    try {
      const newImageUrl = await editVisual(currentSession.imageUrl, editPrompt);
      setCurrentSession({ ...currentSession, imageUrl: newImageUrl });
      setEditPrompt("");
    } catch (e) { alert("Edit failed."); }
    finally { setIsEditing(false); }
  };

  const startVoiceControl = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    voiceChunksRef.current = [];
    recorder.ondataavailable = (e) => voiceChunksRef.current.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(voiceChunksRef.current, { type: 'audio/wav' });
      setVoiceFeedback("Processing command...");
      try {
        const { transcript, intent } = await processVoiceCommand(blob);
        setVoiceFeedback(`"${transcript}"`);
        
        if (intent.theme && ThemeMap[intent.theme]) setTheme(ThemeMap[intent.theme]);
        if (intent.voice && VoiceMap[intent.voice]) setVoice(VoiceMap[intent.voice]);
        
        if (intent.action === 'generate_image') handleGenerate('image', ThemeMap[intent.theme], VoiceMap[intent.voice]);
        else if (intent.action === 'generate_video') handleGenerate('video', ThemeMap[intent.theme], VoiceMap[intent.voice]);
        else if (['play', 'pause', 'stop'].includes(intent.action)) {
          setExternalPlaybackCommand(intent.action as any);
          setTimeout(() => setExternalPlaybackCommand(null), 100);
        }
      } catch (err) {
        setVoiceFeedback("Sorry, I couldn't understand that.");
      } finally {
        setTimeout(() => {
          setIsListening(false);
          setVoiceFeedback("");
        }, 2000);
      }
    };
    recorder.start();
    setIsListening(true);
    setVoiceFeedback("Listening...");
  };

  const stopVoiceControl = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleFileAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const prompt = file.type.startsWith('video') ? "Analyze this video for its mindfulness potential. What happens in it?" : "Analyze this image for mindfulness elements.";
      const res = await analyzeMedia(file, prompt);
      setAnalysisResult(res);
    } catch { setAnalysisResult("Failed to interpret the media."); }
    finally { setIsAnalyzing(false); }
  };

  return (
    <div className="min-h-screen gradient-bg text-slate-100 pb-20">
      <nav className="glass border-b border-white/5 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">🧘</div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">ZenAI</span>
          </div>
          <div className="flex items-center gap-4">
             <button 
              onClick={async () => alert(await fastResponse("Give me a 5-word quote about peace."))}
              className="text-[10px] text-slate-500 hover:text-indigo-400 font-bold uppercase tracking-widest transition-colors"
            >
              Fast Tip
            </button>
            <button 
              onMouseDown={startVoiceControl}
              onMouseUp={stopVoiceControl}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse' : 'bg-white/10 hover:bg-white/20'}`}
              title="Hold to give voice command"
            >
              🎙️
            </button>
            <Button variant="ghost" onClick={() => setShowLive(true)} className="text-xs">Live Guide</Button>
            {!hasKey && <Button variant="secondary" onClick={handleOpenKey} className="text-xs">Select API Key</Button>}
          </div>
        </div>
      </nav>

      {isListening && (
        <div className="fixed inset-0 z-[100] bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center pointer-events-none transition-all">
          <div className="bg-slate-900/90 p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200">
            <div className="relative">
              <div className="w-16 h-16 bg-indigo-500 rounded-full animate-ping absolute opacity-40"></div>
              <div className="w-16 h-16 bg-indigo-600 rounded-full relative flex items-center justify-center text-2xl">🎙️</div>
            </div>
            <p className="text-xl font-medium text-slate-200 italic">{voiceFeedback}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-2 gap-16">
        <div className="space-y-10">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">CRAFT YOUR <span className="text-indigo-400">CALM</span>.</h1>
            <p className="text-slate-400 text-lg max-w-lg">Advanced Multi-modal Generative AI. Generate, animate, and edit your mindfulness journey.</p>
          </div>

          <div className="glass p-8 rounded-[2rem] border border-white/10 space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Theme</label>
                <div className="grid gap-2">
                  {Object.values(MeditationTheme).map(t => (
                    <button key={t} onClick={() => setTheme(t)} className={`text-left px-4 py-2 rounded-lg text-xs transition-all ${theme === t ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                 <div>
                   <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-2">Image Size</label>
                   <div className="flex gap-2">
                    {['1K', '2K', '4K'].map(s => (
                      <button key={s} onClick={() => setImageSize(s as ImageSize)} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${imageSize === s ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500' : 'bg-white/5 text-slate-500 border-white/5'}`}>{s}</button>
                    ))}
                   </div>
                 </div>
                 <div>
                   <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-2">Aspect Ratio</label>
                   <div className="grid grid-cols-4 gap-2">
                     {['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'].map(r => (
                       <button key={r} onClick={() => setAspectRatio(r as AspectRatio)} className={`py-1 rounded-md text-[10px] border transition-all ${aspectRatio === r ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 text-slate-500 border-white/5'}`}>{r}</button>
                     ))}
                   </div>
                 </div>
                 <div>
                   <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 block mb-2">Voice</label>
                   <div className="flex flex-wrap gap-2">
                     {Object.values(VoiceName).map(v => (
                       <button key={v} onClick={() => setVoice(v)} className={`px-2 py-1 rounded-md text-[10px] ${voice === v ? 'bg-indigo-500' : 'bg-white/5 text-slate-500'}`}>{v}</button>
                     ))}
                   </div>
                 </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => handleGenerate('image')} disabled={isGenerating} className="flex-1 py-4">Generate Image Session</Button>
              <Button onClick={() => handleGenerate('video')} disabled={isGenerating} variant="secondary" className="flex-1 py-4">Generate Video Session</Button>
            </div>
            {isGenerating && <p className="text-center text-xs text-indigo-400 animate-pulse">{loadingStep}</p>}
          </div>

          <div className="glass p-8 rounded-[2rem] border border-white/10 space-y-4">
            <h3 className="font-bold flex items-center gap-2">📸 Analysis & Studio</h3>
            <p className="text-xs text-slate-500">Upload a photo or video for understanding or animation.</p>
            <input type="file" accept="image/*,video/*" onChange={handleFileAnalysis} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"/>
            {isAnalyzing && <p className="text-xs text-amber-400 animate-pulse">ZenAI is observing your media...</p>}
            {analysisResult && (
              <div className="p-4 bg-black/30 rounded-xl text-xs leading-relaxed border border-white/10 text-slate-300 max-h-40 overflow-y-auto">
                <p className="font-bold mb-1 text-indigo-400 underline decoration-indigo-500/50">Analysis Result:</p>
                {analysisResult}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[500px] gap-6">
          {currentSession ? (
            <div className="glass w-full rounded-[3rem] p-4 flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
              <div className="w-full aspect-video rounded-[2.5rem] overflow-hidden shadow-2xl relative group bg-black/20">
                {currentSession.videoUrl ? (
                  <video src={currentSession.videoUrl} className="w-full h-full object-cover" autoPlay loop muted />
                ) : (
                  <img src={currentSession.imageUrl} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                   <Button onClick={() => setCurrentSession(currentSession)} className="rounded-full w-14 h-14 p-0 shadow-xl">▶</Button>
                   {!currentSession.videoUrl && (
                     <Button onClick={handleAnimateImage} variant="secondary" className="rounded-full h-14 px-6 text-xs font-bold uppercase tracking-widest shadow-xl">Animate (Veo)</Button>
                   )}
                </div>
              </div>
              <div className="w-full mt-6 space-y-4 text-center">
                <h3 className="text-2xl font-black">{currentSession.script.title}</h3>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <div className="flex gap-2">
                    <input 
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Edit image prompt..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <Button onClick={handleEditImage} disabled={isEditing || !editPrompt} className="text-[10px] px-2">Edit</Button>
                  </div>
                  <Button onClick={() => setCurrentSession(currentSession)} className="w-full">Open Player</Button>
                </div>
              </div>
            </div>
          ) : (
             <div className="text-center space-y-6">
                <div className="w-40 h-40 bg-white/5 rounded-full mx-auto flex items-center justify-center text-6xl opacity-20 border border-white/10 ring-4 ring-indigo-500/5">🧘‍♀️</div>
                <p className="text-slate-500 max-w-xs font-medium">Configure your atmosphere or upload media to begin a bespoke session.</p>
             </div>
          )}
        </div>
      </main>

      {showLive && <LiveSession onClose={() => setShowLive(false)} />}
      {currentSession && (
        <MeditationPlayer 
          session={currentSession} 
          onClose={() => setCurrentSession(null)} 
          externalCommand={externalPlaybackCommand}
        />
      )}
      <ChatBot />
    </div>
  );
};

export default App;
