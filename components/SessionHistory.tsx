import React from 'react';
import { Session } from '../types';
import { Clock, MessageSquare, X, Calendar, Users } from 'lucide-react';

interface SessionHistoryProps {
  sessions: Session[];
  onClose: () => void;
}

const SessionHistory: React.FC<SessionHistoryProps> = ({ sessions, onClose }) => {
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
              // Extract unique submitters
              const allSubmitters = Array.from(new Set(session.words.flatMap(w => w.submittedBy)));

              return (
                <div key={session.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 hover:border-indigo-200 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-slate-800 text-lg">{session.topic}</h3>
                    <span className="text-xs text-slate-400 whitespace-nowrap bg-white px-2 py-1 rounded border border-slate-100">
                      {new Date(session.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Words Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {session.words.length > 0 ? (
                      session.words
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10)
                        .map((w, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-600">
                            {w.text}
                            <span className="bg-indigo-100 text-indigo-700 px-1 rounded-[4px] font-mono font-bold text-[10px]">{w.count}</span>
                          </span>
                        ))
                    ) : (
                      <span className="text-sm text-slate-400 italic">ไม่มีคำตอบในรอบนี้</span>
                    )}
                    {session.words.length > 10 && (
                      <span className="text-xs text-slate-400 self-center">+ อีก {session.words.length - 10} คำ</span>
                    )}
                  </div>

                  {/* Submitters List */}
                  {allSubmitters.length > 0 && (
                    <div className="mb-3 p-3 bg-white rounded-lg border border-slate-100">
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase mb-2">
                        <Users size={12} /> ผู้เข้าร่วม ({allSubmitters.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {allSubmitters.map((name, i) => (
                          <span key={i} className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <MessageSquare size={12} />
                      <span>{session.words.reduce((acc, curr) => acc + curr.count, 0)} คำตอบรวม</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
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