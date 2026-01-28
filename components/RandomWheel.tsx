import React, { useEffect, useMemo, useState } from 'react';
import { X, Dices, RotateCcw, Trash2 } from 'lucide-react';
import { WheelState } from '../types';
import { playSfx } from '../services/audioService';

interface RandomWheelProps {
  isAdmin: boolean;
  state: WheelState;
  onUpdateState: (newState: Partial<WheelState>) => void;
  onClose: () => void;
}

const RandomWheel: React.FC<RandomWheelProps> = ({ isAdmin, state, onUpdateState, onClose }) => {
  // Local visual state for spinning animation when syncing
  const [visualResult, setVisualResult] = useState<number | null>(state.currentResult);
  const wasSpinningRef = React.useRef(state.isSpinning);

  // Calculate available numbers
  const availableNumbers = useMemo(() => {
    const allNumbers = [];
    for (let i = state.min; i <= state.max; i++) {
      allNumbers.push(i);
    }
    return allNumbers.filter(n => !state.history.includes(n));
  }, [state.min, state.max, state.history]);

  // Sync visual result with prop state and play SFX when result is announced
  useEffect(() => {
    if (!state.isSpinning) {
        setVisualResult(state.currentResult);
        
        // SFX disabled by request
    }
    wasSpinningRef.current = state.isSpinning;
  }, [state.currentResult, state.isSpinning]);

  // Local spinning effect for Users (visual only)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state.isSpinning) {
       interval = setInterval(() => {
          setVisualResult(Math.floor(Math.random() * (state.max - state.min + 1)) + state.min);
       }, 100);
    }
    return () => clearInterval(interval);
  }, [state.isSpinning, state.min, state.max]);

  const handleSpin = () => {
    if (state.isSpinning || !isAdmin) return;
    if (availableNumbers.length === 0) {
      alert("สุ่มครบทุกตัวเลขแล้ว! กรุณาล้างประวัติเพื่อเริ่มใหม่");
      return;
    }

    // 1. Start Spinning
    onUpdateState({ isSpinning: true, currentResult: null });

    // 2. Determine Result (Admin Logic)
    setTimeout(() => {
       const randomIndex = Math.floor(Math.random() * availableNumbers.length);
       const finalNumber = availableNumbers[randomIndex];
       
       // 3. Stop Spinning and Update
       onUpdateState({
         isSpinning: false,
         currentResult: finalNumber,
         history: [...state.history, finalNumber]
       });
    }, 2000); // 2 seconds spin
  };

  const handleClearHistory = () => {
    if (confirm("ล้างประวัติการสุ่มทั้งหมด?")) {
      onUpdateState({ history: [], currentResult: null });
    }
  };

  const updateMin = (val: number) => onUpdateState({ min: val });
  const updateMax = (val: number) => onUpdateState({ max: val });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                <Dices size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">วงล้อสุ่มเลข</h2>
                <p className="text-xs text-slate-500">
                  {isAdmin ? `เหลือ ${availableNumbers.length} หมายเลข` : 'กำลังถ่ายทอดสดจาก Admin'}
                </p>
              </div>
           </div>
           {isAdmin && (
             <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full"
            >
              <X size={24} />
            </button>
           )}
        </div>

        {/* Inputs (Admin Only) */}
        {isAdmin && (
          <div className="flex gap-4 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Min</label>
              <input 
                type="number" 
                value={state.min} 
                onChange={(e) => updateMin(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                disabled={state.isSpinning}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Max</label>
              <input 
                type="number" 
                value={state.max} 
                onChange={(e) => updateMax(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                disabled={state.isSpinning}
              />
            </div>
          </div>
        )}

        {/* Display */}
        <div className="h-32 flex items-center justify-center bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-slate-100 mb-4 relative shadow-inner overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
           {visualResult !== null ? (
             <span className={`text-7xl font-black ${state.isSpinning ? 'text-slate-400 blur-[2px]' : 'text-indigo-600 scale-110'} transition-all duration-300 relative z-10`}>
               {visualResult}
             </span>
           ) : (
             <span className="text-slate-300 text-sm font-medium">
               {isAdmin ? 'กดปุ่มเพื่อสุ่ม' : 'รอ Admin สุ่ม...'}
             </span>
           )}
        </div>

        {/* Action (Admin Only) */}
        {isAdmin && (
          <button 
            onClick={handleSpin}
            disabled={state.isSpinning || availableNumbers.length === 0}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {state.isSpinning ? 'กำลังหมุน...' : availableNumbers.length === 0 ? 'หมดแล้ว!' : 'สุ่มเลย!'}
          </button>
        )}

        {/* History */}
        <div className="border-t border-slate-100 pt-4 flex-grow overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <RotateCcw size={12} /> ประวัติ ({state.history.length})
            </h3>
            {isAdmin && state.history.length > 0 && (
              <button 
                onClick={handleClearHistory}
                className="text-[10px] text-rose-500 hover:text-rose-700 flex items-center gap-1 hover:bg-rose-50 px-2 py-1 rounded transition-colors"
              >
                <Trash2 size={10} /> ล้าง
              </button>
            )}
          </div>
          
          <div className="flex-grow overflow-y-auto">
            {state.history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 italic">ยังไม่มีเลขที่สุ่มได้</p>
            ) : (
              <div className="flex flex-wrap gap-2 content-start">
                {state.history.map((num, i) => (
                  <span 
                    key={i} 
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-sm font-bold border border-slate-200"
                  >
                    {num}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {!isAdmin && (
           <div className="text-center text-[10px] text-slate-400 mt-2">
             กำลังดูหน้าจอจาก Admin
           </div>
        )}

      </div>
    </div>
  );
};

export default RandomWheel;