import React, { useState } from 'react';
import { WordEntry } from '../types';
import { Trophy, MessageCircle, ChevronDown, ChevronUp, Users, CheckSquare, Square } from 'lucide-react';

interface WordListProps {
  words: WordEntry[];
  isAdmin?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

const WordList: React.FC<WordListProps> = ({ 
  words, 
  isAdmin = false, 
  selectedIds = [], 
  onToggleSelect 
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sortedWords = [...words].sort((a, b) => b.count - a.count);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Stop row expansion
    if (onToggleSelect) onToggleSelect(id);
  };

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
        <p>ยังไม่มีข้อมูลในรายการ</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-y-auto max-h-[60vh]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {isAdmin && <th className="px-4 py-3 w-10 text-center"></th>}
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-12 text-center">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">คำตอบ</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-20">จำนวน</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24"></th> 
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedWords.map((word, index) => {
              const percentage = Math.round((word.count / sortedWords[0].count) * 100);
              const isExpanded = expandedId === word.id;
              const isSelected = selectedIds.includes(word.id);
              
              return (
                <React.Fragment key={word.id}>
                  <tr 
                    className={`cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-slate-50'} ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
                    onClick={() => toggleExpand(word.id)}
                  >
                    {isAdmin && (
                      <td className="px-4 py-4 text-center" onClick={(e) => handleSelect(e, word.id)}>
                        <button 
                          className={`transition-colors p-1 rounded-md hover:bg-indigo-100 ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}
                          onClick={(e) => handleSelect(e, word.id)}
                        >
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 font-medium text-center">
                      {index + 1}
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        {word.text}
                        {index === 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600 text-right font-mono">
                      {word.count}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="flex-grow h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        {isExpanded ? 
                          <ChevronUp size={16} className="text-slate-400" /> : 
                          <ChevronDown size={16} className="text-slate-400" />
                        }
                      </div>
                    </td>
                  </tr>
                  {/* Expanded Submitter List */}
                  {isExpanded && (
                    <tr className="bg-indigo-50/30">
                      <td colSpan={isAdmin ? 5 : 4} className="px-6 py-3 border-b border-indigo-50">
                        <div className="flex items-start gap-2 text-xs text-slate-500">
                          <Users size={14} className="mt-0.5 text-indigo-400" />
                          <div>
                             <span className="font-semibold text-indigo-600 mb-1 block">ผู้ส่งคำตอบ ({word.submittedBy.length}):</span>
                             <div className="flex flex-wrap gap-1">
                               {word.submittedBy.map((name, i) => (
                                 <span key={i} className="bg-white border border-indigo-100 px-2 py-1 rounded-md text-slate-600">
                                   {name}
                                 </span>
                               ))}
                             </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WordList;