import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Settings, Play, Upload, Trophy, RotateCcw } from 'lucide-react';
import { ThreeSecConfig } from '../types';

interface ThreeSecondsGameProps {
  isAdmin: boolean;
  onBroadcastState: (state: Partial<ThreeSecConfig>) => void;
  syncedConfig?: ThreeSecConfig; // State from Supabase for users
}

const ThreeSecondsGame: React.FC<ThreeSecondsGameProps> = ({ isAdmin, onBroadcastState, syncedConfig }) => {
  // --- Local State (Admin owns the truth) ---
  const [activeTab, setActiveTab] = useState<'PLAY' | 'SETUP'>('PLAY');
  const [rawText, setRawText] = useState('');
  const [config, setConfig] = useState<ThreeSecConfig>({
    questions: [],
    history: [],
    currentQuestionIndex: null,
    targetIndex: null,
    isSpinning: false,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);

  // --- Initialization & LocalStorage ---
  useEffect(() => {
    if (isAdmin) {
      // Restore from LocalStorage
      const saved = localStorage.getItem('3sec_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setConfig(prev => ({ ...prev, ...parsed, isSpinning: false, currentQuestionIndex: parsed.currentQuestionIndex ?? null }));
          setRawText(parsed.questions ? parsed.questions.join('\n') : '');
        } catch (e) {
          console.error("Failed to parse local config", e);
        }
      }
      setIsLoaded(true);
    }
  }, [isAdmin]);

  // Sync state for non-admins
  const displayConfig = isAdmin ? config : (syncedConfig || config);

  // Save to LocalStorage (Admin only)
  useEffect(() => {
    if (isAdmin && isLoaded) {
      const toSave = { ...config, isSpinning: false }; // Don't save spinning state
      localStorage.setItem('3sec_config', JSON.stringify(toSave));
    }
  }, [config, isAdmin, isLoaded]);

  // --- Sound Logic (Win Sound only - using random SFX) ---
  const prevSpinning = useRef(displayConfig.isSpinning);
  
  useEffect(() => {
    // SFX disabled by request (win sound)
    prevSpinning.current = displayConfig.isSpinning;
  }, [displayConfig.isSpinning, displayConfig.currentQuestionIndex, isAdmin]);

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

    const container = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    
    // Create the wheel group that will rotate
    const wheelGroup = container.append("g").attr("class", "wheel-group");

    const color = d3.scaleOrdinal(d3.schemeSet3);
    const pie = d3.pie<number>().value(1).sort(null);
    const arc = d3.arc<d3.PieArcDatum<number>>().innerRadius(40).outerRadius(radius - 10);

    const arcs = wheelGroup.selectAll("arc")
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

    // Static Arrow Indicator (Pointing Down from Top)
    // Triangle pointing down at (0, -radius)
    container.append("path")
       .attr("d", "M -10 -170 L 10 -170 L 0 -150 Z") // Adjust position based on radius
       .attr("transform", `translate(0, -20)`) 
       .attr("fill", "#f43f5e")
       .attr("stroke", "#881337")
       .attr("stroke-width", 2);
       
    // --- Spin Animation ---
    if (displayConfig.isSpinning && displayConfig.targetIndex !== undefined && displayConfig.targetIndex !== null) {
       const targetIndex = displayConfig.targetIndex;
       const anglePerSlice = 360 / count;
       // Calculate rotation to center the target slice at the top (0 degrees - or -90?)
       // D3 pie normally starts at 12 o'clock. Center of slice i is (i + 0.5) * anglePerSlice.
       // We want (i + 0.5) * anglePerSlice + rotation = 0 (mod 360)
       // So rotation = -(i + 0.5) * anglePerSlice
       
       const targetAngle = (targetIndex + 0.5) * anglePerSlice;
       const rounds = 5; // Spin 5 times
       const totalRotation = 360 * rounds - targetAngle;

       wheelGroup.transition()
         .duration(3500)
         .ease(d3.easeCubicOut)
         .attrTween("transform", function() {
           return d3.interpolateString("rotate(0)", `rotate(${totalRotation})`);
         })
         .on("end", () => {
             // Logic handled by Admin timeout, but visual end needs to persist rotation
             // However, on re-render, this will reset if isSpinning becomes false
             // We need to handle static rotation state or relies on re-render
         });
    } else if (displayConfig.currentQuestionIndex !== null) {
       // Show result position
       const targetIndex = displayConfig.currentQuestionIndex;
       const anglePerSlice = 360 / count;
       const targetAngle = (targetIndex + 0.5) * anglePerSlice;
       const finalRotation = 360 - targetAngle; // Normalize to 0-360
       wheelGroup.attr("transform", `rotate(${finalRotation})`);
    }

  }, [displayConfig.questions.length, displayConfig.history, displayConfig.isSpinning, displayConfig.targetIndex, displayConfig.currentQuestionIndex]);

  // --- Handlers (Admin) ---

  const handleImport = () => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newConfig = {
      ...config,
      questions: lines,
      history: [],
      currentQuestionIndex: null,
      targetIndex: null,
      isSpinning: false
    };
    setConfig(newConfig);
    onBroadcastState(newConfig);
    setActiveTab('PLAY');
  };

  const handleSpin = () => {
    if (config.isSpinning || config.questions.length === 0) return;
    
    // Filter available indices
    const availableIndices = config.questions.map((_, i) => i).filter(i => !config.history.includes(i));
    
    if (availableIndices.length === 0) {
      if (confirm("สุ่มครบทุกข้อแล้ว! ต้องการรีเซ็ตประวัติหรือไม่?")) {
        handleResetHistory();
      }
      return;
    }

    // 1. Determine Result Immediately
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomIndex];

    // 2. Start Spin with Target
    const startState = { 
        ...config, 
        isSpinning: true, 
        currentQuestionIndex: null,
        targetIndex: selectedIndex 
    };
    setConfig(startState);
    onBroadcastState(startState);

    // 3. Stop after delay (Synced with D3 duration)
    setTimeout(() => {
      const endState = {
        ...config, // Use current config to avoid closure stale state
        isSpinning: false,
        currentQuestionIndex: selectedIndex,
        targetIndex: selectedIndex,
        showingResult: true, // Show the big modal
        history: [...config.history, selectedIndex]
      };
      
      // We need to fetch the latest history from state/ref in a real app, 
      // but here config is from closure. Ideally use functional update or ref.
      // Since history doesn't change during spin, this is safe.
      
      setConfig(endState);
      onBroadcastState(endState);
    }, 3500);
  };

  const handleResetHistory = () => {
    const newState = { ...config, history: [], currentQuestionIndex: null, targetIndex: null, isSpinning: false, showingResult: false };
    setConfig(newState);
    onBroadcastState(newState);
  };
  
  const handleCloseResult = () => {
      const newState = { ...config, showingResult: false };
      setConfig(newState);
      onBroadcastState(newState);
  };

  // --- Render ---
  
  // Large Result Modal (Overlay) - Visible to everyone if showingResult is true
  const renderResultModal = () => {
      if (!displayConfig.showingResult || displayConfig.currentQuestionIndex === null) return null;
      
      const qText = displayConfig.questions[displayConfig.currentQuestionIndex];
      
      // Admin View: Smaller, less intrusive modal
      if (isAdmin) {
          return (
              <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                  {/* Backdrop is transparent for admin so they can still see controls, but maybe dim slightly? 
                      Actually user wants to "close it themselves", so it must be interactive.
                      But "not suitable for computer screen" means strictly size/blocking. 
                  */}
                  <div className="fixed inset-0 bg-black/20 pointer-events-auto" onClick={handleCloseResult}></div>
                  
                  <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-4 border-indigo-200 p-8 max-w-lg w-full pointer-events-auto transform scale-100 animate-in zoom-in-95 duration-200 relative">
                        <button 
                           onClick={handleCloseResult}
                           className="absolute top-2 right-2 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                        >
                           <Settings size={20} />
                        </button>
                        
                        <div className="text-center">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Player View Result</h2>
                            <p className="text-3xl font-black text-slate-800 leading-tight mb-8">
                               {qText}
                            </p>
                            
                            <button 
                                onClick={handleCloseResult}
                                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 shadow-lg"
                            >
                                Close Result (Hide for All)
                            </button>
                        </div>
                  </div>
              </div>
          );
      }
      
      // User View: Full Screen Immersive (Scaled down slightly)
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
             <div className="w-full max-w-3xl p-4 md:p-8 transform scale-100 animate-in zoom-in-50 duration-500">
                <div className="bg-white rounded-[2rem] p-8 md:p-16 text-center shadow-2xl relative border-8 border-indigo-200 overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500"></div>
                    
                    <Trophy size={100} className="text-amber-500 mx-auto mb-8 drop-shadow-2xl animate-bounce" />
                    
                    <h2 className="text-xl md:text-3xl font-bold text-slate-400 mb-6 uppercase tracking-[0.2em]">The Winner Is</h2>
                    
                    <div className="py-4 relative">
                       <p className="text-4xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-600 leading-tight break-words drop-shadow-sm">
                          {qText}
                       </p>
                    </div>
                </div>
             </div>
          </div>
      );
  };

  // User View (Simple)
  if (!isAdmin) {
    return (
        <>
            {renderResultModal()}
            {displayConfig.isSpinning ? (
                 <div className="flex flex-col items-center justify-center h-[60vh]">
                    <h1 className="text-4xl md:text-6xl font-black text-indigo-600 mb-8 animate-pulse">กำลังสุ่ม...</h1>
                     <svg ref={svgRef} width="300" height="300" className="drop-shadow-xl"></svg>
                 </div>
            ) : displayConfig.currentQuestionIndex !== null ? (
                 <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center animate-in zoom-in duration-500">
                    <Trophy size={80} className="text-amber-500 mb-6 drop-shadow-lg" />
                    <h2 className="text-2xl text-slate-500 font-bold mb-2">ผลลัพธ์คือ</h2>
                    <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-indigo-100 max-w-2xl w-full">
                        <p className="text-3xl md:text-5xl font-black text-slate-800 leading-tight">
                          {displayConfig.questions[displayConfig.currentQuestionIndex]}
                        </p>
                    </div>
                 </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
                  <p className="text-xl">รอกิจกรรมเริ่ม...</p>
               </div>
            )}
        </>
    );
  }

  // Admin View
  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      {renderResultModal()}
      
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
          <Settings size={18} /> Setup
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


        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center animate-in fade-in">
           
           {/* Wheel Container */}
           <div className="relative">
              <div className="bg-white rounded-full shadow-2xl p-2 border-4 border-slate-100">
                 <svg ref={svgRef} width="400" height="400" className="w-[300px] h-[300px] md:w-[400px] md:h-[400px]"></svg>
              </div>
           </div>

           {/* Controls */}
           <div className="flex flex-col gap-4 w-full md:w-64">
              {config.currentQuestionIndex !== null && !config.isSpinning && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-center animate-in slide-in-from-bottom-2">
                   <p className="text-xs text-indigo-400 uppercase font-bold mb-1">Result</p>
                   <p className="text-xl font-black text-indigo-700">
                     {config.questions[config.currentQuestionIndex]}
                   </p>
                </div>
              )}
              
              <button 
                onClick={handleSpin}
                disabled={config.isSpinning || config.questions.length === 0}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black text-xl shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
              >
                {config.isSpinning ? 'Spinning...' : 'SPIN!'}
              </button>
              
              <div className="flex gap-2">
                 <button 
                   onClick={handleResetHistory}
                   className="flex-1 py-2 bg-white border border-slate-200 text-slate-500 font-bold rounded-lg hover:bg-slate-50 text-xs flex items-center justify-center gap-1"
                 >
                   <RotateCcw size={14}/> Reset ({config.history.length})
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