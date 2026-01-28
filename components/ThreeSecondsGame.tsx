import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Settings, Play, Upload, Trophy, RotateCcw } from 'lucide-react';
import { ThreeSecConfig } from '../types';

import { useModal } from './ModalProvider';
import * as audioService from '../services/audioService';

interface ThreeSecondsGameProps {
  isAdmin: boolean;
  onBroadcastState: (state: Partial<ThreeSecConfig>) => void;
  syncedConfig?: ThreeSecConfig; // State from Supabase for users
}

const ThreeSecondsGame: React.FC<ThreeSecondsGameProps> = ({ isAdmin, onBroadcastState, syncedConfig }) => {
  const { showConfirm } = useModal();
  // --- Local State (Admin owns the truth) ---
  const [activeTab, setActiveTab] = useState<'PLAY' | 'SETUP'>('PLAY');
  const [rawText, setRawText] = useState('');
  const [config, setConfig] = useState<ThreeSecConfig>({
    questions: [],
    history: [],
    currentQuestionIndex: null,
    targetIndex: null,
    isSpinning: false,
    showingResult: false
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);

  // --- Initialization & LocalStorage ---
  useEffect(() => {
    if (isAdmin) {
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

  useEffect(() => {
    if (isAdmin && isLoaded) {
      const toSave = { ...config, isSpinning: false };
      localStorage.setItem('3sec_config', JSON.stringify(toSave));
    }
  }, [config, isAdmin, isLoaded]);

  const displayConfig = isAdmin ? config : (syncedConfig || config);
  const prevSpinning = useRef(displayConfig.isSpinning);
  
  useEffect(() => {
    // SFX disabled by request (win sound)
    prevSpinning.current = displayConfig.isSpinning;
  }, [displayConfig.isSpinning, displayConfig.currentQuestionIndex, isAdmin]);

  // Wheel D3 Logic
  useEffect(() => {
    if (!svgRef.current) return;
    
    // Clear previous
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const width = 400;
    const height = 400;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    
    const radius = Math.min(width, height) / 2;
    
    const container = svg.append('g')
      .attr('transform', `translate(${width/2},${height/2})`);
      
    // Background circle
    container.append('circle')
      .attr('r', radius - 5)
      .attr('fill', '#fff')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', '4px');

    const data = displayConfig.questions.length > 0 ? displayConfig.questions : ['Waiting...', 'Waiting...', 'Waiting...'];
    
    const pie = d3.pie<string>()
      .value(1)
      .sort(null);
      
    const arc = d3.arc<d3.PieArcDatum<string>>()
      .innerRadius(0)
      .outerRadius(radius - 20);
      
    // Colors (using a nicer palette)
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
        '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'
    ];
    
    const arcs = container.selectAll('arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');
      
    // Wheel Slices
    arcs.append('path')
      .attr('d', arc as any)
      .attr('fill', (d, i) => colors[i % colors.length])
      .attr('stroke', 'white')
      .style('stroke-width', '2px');
      
    // Text Labels
    arcs.append('text')
      .attr('transform', d => {
        const [x, y] = arc.centroid(d as any);
        const angle = (d.startAngle + d.endAngle) / 2 * 180 / Math.PI;
         // Adjust rotation so text reads outwards
        return `translate(${x},${y}) rotate(${angle + 90})`; 
      })
      .attr('dy', '0.35em')
      .text(d => {
          // Display Number (Index + 1) instead of Text for suspense
          return (d.index + 1).toString();
      })
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .style('font-size', '20px')
      .style('font-weight', '900')
      .style('text-shadow', '0 2px 4px rgba(0,0,0,0.5)');
      
    // Arrow Indicator (Top - Pointing DOWN into the wheel)
    svg.append('path')
      .attr('d', `M ${width/2} 40 L ${width/2 - 15} 10 L ${width/2 + 15} 10 Z`) 
      .attr('fill', '#334155') 
      .attr('stroke', 'white')
      .attr('stroke-width', '2px')
      .style('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))');
      
    // Spin Logic
    if (displayConfig.isSpinning && displayConfig.targetIndex !== null) {
          const sliceAngle = 360 / data.length;
          // Target is at index. Top is 0 degrees? default pie starts at 12 o'clock? 
          // D3 pie starts at 12 o'clock (0 rad).
          // We want the target slice to end up under the arrow (Top).
          // Arrow is at 0 degrees.
          // Slice center angle for target index I:
          // startAngle + (endAngle - startAngle)/2
          // We need to rotate the whole wheel such that this angle aligns with 0 (mod 360).
          // Actually we rotate negative amount.
          
          // Let's rely on simple slice calculation:
          // Angle per slice = 360/N.
          // Target Angle = index * Angle + Angle/2.
          // We want to rotate so Target Angle is at 0 (or 360).
          // Required Rotation = 360 - Target Angle.
          // Add extra spins (5 * 360).
          
          const anglePerSlice = 360 / data.length;
          // D3 generated angles are in Radians.
          // 0 is Top-Center (12 o'clock) for D3.arc defaults? No.
          // Default startAngle is 0 (12 o'clock).
          // So Index 0 is at [0, angle]. Center is angle/2.
          // We want Index 0 to be at Top?
          // If we rotate G by - (angle/2), Index 0 is centered at Top.
          // Target Index I: Center is I*angle + angle/2.
          // We want to rotate by - (I*angle + angle/2).
          // Add 360s.
          // Result: 360*5 - (targetIndex * anglePerSlice + anglePerSlice/2).
          
          const targetRotation = 360 * 5 - (displayConfig.targetIndex * anglePerSlice + anglePerSlice / 2);
          
          container.transition()
           .duration(3000)
           .ease(d3.easeCubicOut)
           .attrTween('transform', function() {
              const i = d3.interpolateString(`translate(${width/2},${height/2}) rotate(0)`, `translate(${width/2},${height/2}) rotate(${targetRotation})`);
              return function(t) { return i(t); };
           });
           
    } else if (displayConfig.currentQuestionIndex !== null) {
        // Static Result Position
        const anglePerSlice = 360 / data.length;
        const targetRotation = 360 - (displayConfig.currentQuestionIndex * anglePerSlice + anglePerSlice / 2);
        // Normalize to 0-360
        container.attr('transform', `translate(${width/2},${height/2}) rotate(${targetRotation % 360})`);
    } else {
         // Idle rotation (slow spin?) or just static
         // container.attr('transform', `translate(${width/2},${height/2}) rotate(0)`);
    }

  }, [displayConfig, isAdmin]);

  // ...

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

  const handleSpin = async () => {
    if (config.isSpinning || config.questions.length === 0) return;
    
    // Filter available indices
    const availableIndices = config.questions.map((_, i) => i).filter(i => !config.history.includes(i));
    
    if (availableIndices.length === 0) {
      const confirmReset = await showConfirm("สุ่มครบทุกข้อแล้ว! ต้องการรีเซ็ตประวัติหรือไม่?", { type: 'warning', confirmText: 'รีเซ็ต' });
      if (confirmReset) {
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
      
      if (isAdmin) {
          audioService.playSfx();
      }
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