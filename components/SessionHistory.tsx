import React from 'react';
import { Session } from '../types';
import { Clock, MessageSquare, X, Calendar, User, RotateCcw } from 'lucide-react';

interface SessionHistoryProps {
  sessions: Session[];
  onClose: () => void;
  isAdmin?: boolean;
  onRestore?: (sessionId: string) => void;
}

const SessionHistory: React.FC<SessionHistoryProps> = ({ sessions, onClose, isAdmin, onRestore }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col relative">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full"
        >
          <X size={24} />
        </button>

        <div className="p-6 border-b border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="text-indigo-500" />
            ประวัติคำถาม
          </h2>
          <p className="text-slate-500 text-sm mt-1">รายการคำถามและคำตอบที่ผ่านมา</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Calendar size={48} className="mx-auto mb-4 opacity-30" />
              <p>ยังไม่มีประวัติการตั้งคำถาม</p>
            </div>
          ) : (
            [...sessions].reverse().map((session) => {
              const sortedWords = session.words.sort((a, b) => b.count - a.count);
              
              return (
                <div key={session.id} className="bg-slate-50 rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4 gap-4">
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 text-lg leading-tight">{session.topic}</h3>
                            <span className="text-xs text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded border border-slate-100 inline-block mt-1">
                                {new Date(session.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {isAdmin && onRestore && (
                            <button 
                                onClick={() => onRestore(session.id)}
                                className="flex items-center gap-1 bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50 shadow-sm transition-all"
                                title="นำคำถามนี้กลับมาใช้ใหม่"
                            >
                                <RotateCcw size={14} /> กู้คืน
                            </button>
                        )}
                    </div>
                    
                    {/* Detailed Word List */}
                    <div className="space-y-3">
                        {sortedWords.length > 0 ? (
                            sortedWords.map((word, i) => (
                                <div key={i} className="bg-white p-3 rounded-lg border border-slate-100">
                                    <div className="flex justify-between items-center mb-2 border-b border-slate-50 pb-2">
                                        <span className="font-bold text-slate-700">{word.text}</span>
                                        <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
                                            {word.count}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {word.submittedBy.length > 0 ? (
                                            word.submittedBy.map((user, uIdx) => (
                                                <div key={uIdx} className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                                                    <User size={10} className="text-slate-400" />
                                                    {user}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-300 italic">ไม่ระบุชื่อ</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 bg-white rounded-lg border border-dashed border-slate-200 text-slate-400 text-sm">
                                ไม่มีคำตอบในรอบนี้
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                            <MessageSquare size={14} />
                            <span>{session.words.reduce((acc, curr) => acc + curr.count, 0)} คำตอบรวม</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Calendar size={14} />
                            <span>{new Date(session.timestamp).toLocaleDateString('th-TH')}</span>
                        </div>
                    </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionHistory;