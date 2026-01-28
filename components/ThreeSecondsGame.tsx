import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Settings, Play, RefreshCw, Volume2, Upload, Trash2, Trophy, RotateCcw } from 'lucide-react';
import { ThreeSecConfig } from '../types';

interface ThreeSecondsGameProps {
  isAdmin: boolean;
  onBroadcastState: (state: Partial<ThreeSecConfig>) => void;
  syncedConfig?: ThreeSecConfig; // State from Supabase for users
}

// Default Sounds
const DEFAULT_SPIN_SOUND = "https://cdn.pixabay.com/audio/2022/03/15/audio_73685e83a4.mp3"; // Drum roll
const DEFAULT_WIN_SOUND = "https://cdn.pixabay.com/audio/2021/08/04/audio_12b0c7443c.mp3"; // Tada/Success

const ThreeSecondsGame: React.FC<ThreeSecondsGameProps> = ({ isAdmin, onBroadcastState, syncedConfig }) => {
  // --- Local State (Admin owns the truth) ---
  const [activeTab, setActiveTab] = useState<'PLAY' | 'SETUP'>('PLAY');
  const [rawText, setRawText] = useState('');
  const [config, setConfig] = useState<ThreeSecConfig>({
    questions: [],
    history: [],
    currentQuestionIndex: null,
    isSpinning: false,
    soundSpinUrl: DEFAULT_SPIN_SOUND,
    soundWinUrl: DEFAULT_WIN_SOUND
  });

  // Refs for Audio
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- Initialization & LocalStorage ---
  useEffect(() => {
    if (isAdmin) {
      // Restore from LocalStorage
      const saved = localStorage.getItem('3sec_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig(prev => ({ ...prev, ...parsed }));
        setRawText(parsed.questions.join('\n'));
      }
    }
  }, [isAdmin]);

  // Sync state for non-admins
  const displayConfig = isAdmin ? config : (syncedConfig || config);

  // Save to LocalStorage (Admin only)
  useEffect(() => {
    if (isAdmin) {
      localStorage.setItem('3sec_config', JSON.stringify(config));
    }
  }, [config, isAdmin]);

  // --- Sound Logic ---
  useEffect(() => {
    spinAudioRef.current = new Audio(displayConfig.soundSpinUrl || DEFAULT_SPIN_SOUND);
    winAudioRef.current = new Audio(displayConfig.soundWinUrl || DEFAULT_WIN_SOUND);
  }, [displayConfig.soundSpinUrl, displayConfig.soundWinUrl]);

  useEffect(() => {
    if (displayConfig.isSpinning) {
      spinAudioRef.current?.play().catch(e => console.log("Audio play failed", e));
    } else {
      spinAudioRef.current?.pause();
      spinAudioRef.current && (spinAudioRef.current.currentTime = 0);
    }
  }, [displayConfig.isSpinning]);

  // Play Win Sound when result appears
  useEffect(() => {
    if (!displayConfig.isSpinning && displayConfig.currentQuestionIndex !== null) {
      winAudioRef.current?.play().catch(e => console.log("Audio play failed", e));
    }
  }, [displayConfig.currentQuestionIndex, displayConfig.isSpinning]);

  // --- Wheel D3 Logic ---
  useEffect(() => {
    if (!svgRef.current) return;
    
    const count = displayConfig.questions.length || 8; // Default segments if empty for visual
    const data = Array.from({ length: count }, (_, i) => i + 1);
    
    const width = 400;
    const height = 400;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal(d3.schemeSet3);
    const pie = d3.pie<number>().value(1).sort(null);
    const arc = d3.arc<d3.PieArcDatum<number>>().innerRadius(40).outerRadius(radius - 10);

    const arcs = g.selectAll("arc")
      .data(pie(data))
      .enter()
      .append("g")
      .attr("class", "arc");

    arcs.append("path")
      .attr("d", arc as any)
      .attr("fill", (d, i) => {
         // Dim used numbers
         if (displayConfig.history.includes(i)) return "#cbd5e1"; 
         return color(i.toString()) as string;
      })
      .attr("stroke", "white")
      .attr("stroke-width", "2px");

    arcs.append("text")
      .attr("transform", (d) => {
        const _d = arc.centroid(d as any);
        return `translate(${_d[0] * 1.5},${_d[1] * 1.5})`; 
      })
      .attr("dy", ".35em")
      .text(d => d.data)
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .attr("fill", "#334155")
      .attr("font-size", count > 20 ? "10px" : "16px");

    // Spinner Arrow
    svg.append("path")
       .attr("d", "M 200 10 L 190 30 L 210 30 Z")
       .attr("fill", "#f43f5e")
       .attr("stroke", "#881337")
       .attr("stroke-width", 2);

  }, [displayConfig.questions.length, displayConfig.history]);

  // --- Handlers (Admin) ---

  const handleImport = () => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newConfig = {
      ...config,
      questions: lines,
      history: [],
      currentQuestionIndex: null
    };
    setConfig(newConfig);
    onBroadcastState(newConfig);
    setActiveTab('PLAY');
  };

  const handleSpin = () => {
    if (config.isSpinning || config.questions.length === 0) return;
    
    const availableIndices = config.questions.map((_, i) => i).filter(i => !config.history.includes(i));
    
    if (availableIndices.length === 0) {
      if (confirm("สุ่มครบทุกข้อแล้ว! ต้องการรีเซ็ตประวัติหรือไม่?")) {
        handleResetHistory();
      }
      return;
    }

    // 1. Start Spin
    const startState = { ...config, isSpinning: true, currentQuestionIndex: null };
    setConfig(startState);
    onBroadcastState(startState);

    // 2. Determine Result
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomIndex];

    // 3. Stop after delay
    setTimeout(() => {
      const endState = {
        ...config,
        isSpinning: false,
        currentQuestionIndex: selectedIndex,
        history: [...config.history, selectedIndex]
      };
      setConfig(endState);
      onBroadcastState(endState);
    }, 3500); // 3.5s spin time
  };

  const handleResetHistory = () => {
    const newState = { ...config, history: [], currentQuestionIndex: null, isSpinning: false };
    setConfig(newState);
    onBroadcastState(newState);
  };

  const handleSoundUpload = (type: 'SPIN' | 'WIN', file: File | null) => {
     if (!file) return;
     const url = URL.createObjectURL(file);
     const newState = { ...config };
     if (type === 'SPIN') newState.soundSpinUrl = url;
     else newState.soundWinUrl = url;
     setConfig(newState);
     // Note: Blob URLs won't persist well across different admin sessions if refreshed, 
     // but suitable for immediate on-site usage as requested "save to localstorage". 
     // For robust storage, we'd need base64 but that's heavy for LS.
     // For now, we update state.
  };

  // --- Render ---

  // User View (Simple)
  if (!isAdmin) {
    if (displayConfig.isSpinning) {
       return (
         <div className="flex flex-col items-center justify-center h-[60vh] animate-pulse">
            <h1 className="text-4xl md:text-6xl font-black text-indigo-600 mb-8">กำลังสุ่ม...</h1>
            <RefreshCw size={64} className="animate-spin text-slate-300" />
         </div>
       );
    }
    if (displayConfig.currentQuestionIndex !== null) {
       const qText = displayConfig.questions[displayConfig.currentQuestionIndex];
       return (
         <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center animate-in zoom-in duration-500">
            <Trophy size={80} className="text-amber-500 mb-6 drop-shadow-lg" />
            <h2 className="text-2xl text-slate-500 font-bold mb-2">ผลลัพธ์คือ</h2>
            <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-indigo-100 max-w-2xl w-full">
                <p className="text-3xl md:text-5xl font-black text-slate-800 leading-tight">
                  {qText}
                </p>
            </div>
         </div>
       );
    }
    return (
       <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
          <p className="text-xl">รอกิจกรรมเริ่ม...</p>
       </div>
    );
  }

  // Admin View
  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      
      {/* Tabs */}
      <div className="flex border-b border-slate-100 mb-6">
        <button 
          onClick={() => setActiveTab('PLAY')}
          className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 ${activeTab === 'PLAY' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
        >
          <Play size={18} /> Play Game
        </button>
        <button 
          onClick={() => setActiveTab('SETUP')}
          className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 ${activeTab === 'SETUP' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
        >
          <Settings size={18} /> Setup & Sounds
        </button>
      </div>

      {activeTab === 'SETUP' ? (
        <div className="space-y-6 animate-in fade-in">
           <div>
             <label className="block text-sm font-bold text-slate-700 mb-2">Import Questions (One per line)</label>
             <textarea 
               value={rawText}
               onChange={(e) => setRawText(e.target.value)}
               className="w-full h-48 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
               placeholder="Question 1&#10;Question 2&#10;Question 3..."
             />
             <div className="mt-2 flex justify-between items-center">
                <span className="text-xs text-slate-500">{rawText.split('\n').filter(x=>x.trim()).length} lines detected</span>
                <button 
                  onClick={handleImport}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Upload size={16} /> Save & Update Wheel
                </button>
             </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div className="bg-slate-50 p-4 rounded-xl">
                 <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Volume2 size={16}/> Spin Sound</h3>
                 <input type="file" accept="audio/*" onChange={(e) => handleSoundUpload('SPIN', e.target.files?.[0] || null)} className="text-xs w-full"/>
                 <audio controls src={config.soundSpinUrl} className="mt-2 w-full h-8" />
              </div>
              <div className="bg-slate-50 p-4 rounded-xl">
                 <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Trophy size={16}/> Win Sound</h3>
                 <input type="file" accept="audio/*" onChange={(e) => handleSoundUpload('WIN', e.target.files?.[0] || null)} className="text-xs w-full"/>
                 <audio controls src={config.soundWinUrl} className="mt-2 w-full h-8" />
              </div>
           </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center animate-in fade-in">
           
           {/* Wheel Container */}
           <div className="relative">
              <div className={`w-[300px] h-[300px] md:w-[400px] md:h-[400px] relative transition-transform duration-[3500ms] cubic-bezier(0.25, 1, 0.5, 1) ${config.isSpinning ? 'rotate-[1080deg]' : 'rotate-0'}`}>
                 <svg ref={svgRef} className="w-full h-full drop-shadow-xl" viewBox="0 0 400 400"></svg>
              </div>
              {/* Center Knob */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-4 border-slate-200 z-10">
                 <div className="w-4 h-4 bg-slate-800 rounded-full"></div>
              </div>
           </div>

           {/* Controls & Result */}
           <div className="flex flex-col gap-4 w-full md:w-64">
              <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-200 min-h-[120px] flex flex-col items-center justify-center">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Result</span>
                 {config.isSpinning ? (
                   <span className="text-2xl font-black text-slate-300 animate-pulse">Spinning...</span>
                 ) : config.currentQuestionIndex !== null ? (
                   <div className="animate-in zoom-in">
                      <span className="text-4xl font-black text-indigo-600 block">#{config.currentQuestionIndex + 1}</span>
                      <p className="text-sm text-slate-600 mt-1 line-clamp-3">{config.questions[config.currentQuestionIndex]}</p>
                   </div>
                 ) : (
                   <span className="text-slate-300">- Ready -</span>
                 )}
              </div>

              <button 
                onClick={handleSpin}
                disabled={config.isSpinning || config.questions.length === 0}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-black text-xl rounded-xl shadow-lg shadow-amber-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                SPIN!
              </button>
              
              <div className="flex gap-2">
                 <button 
                   onClick={handleResetHistory}
                   className="flex-1 py-2 bg-white border border-slate-200 text-slate-500 font-bold rounded-lg hover:bg-slate-50 text-xs flex items-center justify-center gap-1"
                 >
                   <RotateCcw size={14}/> Reset History ({config.history.length})
                 </button>
              </div>

              <div className="text-center">
                 <p className="text-xs text-slate-400">Total Questions: {config.questions.length}</p>
                 <p className="text-xs text-slate-400">Remaining: {config.questions.length - config.history.length}</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ThreeSecondsGame;