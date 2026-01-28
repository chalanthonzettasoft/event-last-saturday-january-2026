import React, { useState } from 'react';
import { UserCircle2, ArrowRight, ShieldCheck, Hash, KeyRound, Plus, DoorOpen, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { DBRoom, DBSession } from '../types';

interface LoginScreenProps {
  onLogin: (nickname: string, isAdmin: boolean, roomData: DBRoom, initialSession: DBSession | null) => void;
}

type AdminStep = 'AUTH' | 'CHOICE' | 'JOIN_ROOM';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminStep, setAdminStep] = useState<AdminStep>('AUTH');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminRoomCode, setAdminRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) return;
    setIsLoading(true);

    try {
        // 1. Find Room
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('code', roomCode)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (roomError || !room) {
          alert('ไม่พบห้องนี้ หรือห้องถูกปิดไปแล้ว');
          setIsLoading(false);
          return;
        }

        // 2. Find Latest Active Session
        const { data: session } = await supabase
          .from('sessions')
          .select('*')
          .eq('room_id', room.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        onLogin(nickname.trim(), false, room, session || null);

    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + (err.message || "Connection Error"));
      setIsLoading(false);
    }
  };

  const verifyAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
         const { data: config, error: configError } = await supabase
           .from('admin_config')
           .select('password')
           .eq('id', 'master')
           .single();

         if (configError || !config || config.password !== adminPassword) {
           alert('รหัสผ่าน Admin ไม่ถูกต้อง');
           setIsLoading(false);
           return;
         }
         
         // Password Correct -> Go to Choice
         setAdminStep('CHOICE');
    } catch (err: any) {
         alert('Error: ' + err.message);
    } finally {
        setIsLoading(false);
    }
  };

  const createNewRoom = async () => {
     setIsLoading(true);
     
     try {
         const randomRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
         
         const { data: newRoom, error: roomError } = await supabase
           .from('rooms')
           .insert({
             code: randomRoomCode,
             is_active: true
           })
           .select()
           .single();

         if (roomError || !newRoom) throw roomError;

         const { data: newSession, error: sessionError } = await supabase
            .from('sessions')
            .insert({
                room_id: newRoom.id,
                room_code: randomRoomCode,
                topic: 'คำถามข้อแรก: พร้อมหรือยัง?',
                is_active: true
            })
            .select()
            .single();

         if (sessionError) throw sessionError;

         onLogin('Admin', true, newRoom, newSession);
     } catch (err: any) {
         alert('สร้างห้องไม่สำเร็จ: ' + err.message);
         setIsLoading(false);
     }
  };

  const joinExistingRoomAsAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminRoomCode.trim()) return;
    setIsLoading(true);

    try {
        // 1. Find Room
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('code', adminRoomCode)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (roomError || !room) {
          alert('ไม่พบห้องนี้');
          setIsLoading(false);
          return;
        }

        // 2. Find Session
        const { data: session } = await supabase
          .from('sessions')
          .select('*')
          .eq('room_id', room.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        onLogin('Admin', true, room, session || null);

    } catch (err: any) {
        alert('เข้าร่วมไม่สำเร็จ: ' + err.message);
        setIsLoading(false);
    }
  };

  const toggleAdminMode = () => {
      if (isAdminMode) {
          // Switch to User
          setIsAdminMode(false);
          setAdminStep('AUTH');
          setAdminPassword('');
          setAdminRoomCode('');
      } else {
          // Switch to Admin
          setIsAdminMode(true);
          setAdminStep('AUTH');
      }
  };

  // --- RENDER HELPERS ---

  const renderAdminAuth = () => (
    <form onSubmit={verifyAdminPassword} className="space-y-4">
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">รหัสผ่าน Admin</label>
            <div className="relative">
                <KeyRound className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                placeholder="Password"
                autoFocus
                />
            </div>
        </div>
        <button
            type="submit"
            disabled={isLoading || !adminPassword}
            className="w-full text-white bg-rose-600 hover:bg-rose-700 shadow-rose-200 py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
            {isLoading ? "Checking..." : "Login"} <ArrowRight size={20} />
        </button>
    </form>
  );

  const renderAdminChoice = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
        <p className="text-center text-slate-600 mb-2">ยินดีต้อนรับ Admin! เลือกการทำงาน:</p>
        
        <button
            onClick={createNewRoom}
            disabled={isLoading}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-95"
        >
            <Plus size={24} /> สร้างห้องใหม่ (Create)
        </button>

        <button
            onClick={() => setAdminStep('JOIN_ROOM')}
            disabled={isLoading}
            className="w-full bg-white border-2 border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-600 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
            <DoorOpen size={24} /> เข้าร่วมห้องเดิม (Join)
        </button>
    </div>
  );

  const renderAdminJoinRoom = () => (
    <form onSubmit={joinExistingRoomAsAdmin} className="space-y-4 animate-in fade-in slide-in-from-right-4">
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">ใส่เลขห้องที่จะบริหารจัดการ</label>
            <div className="relative">
                <Hash className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input
                type="tel"
                value={adminRoomCode}
                onChange={(e) => setAdminRoomCode(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-lg tracking-widest transition-all"
                placeholder="0000"
                maxLength={4}
                autoFocus
                />
            </div>
        </div>
        <div className="flex gap-3">
             <button
                type="button"
                onClick={() => setAdminStep('CHOICE')}
                className="px-4 py-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200"
             >
                <ArrowLeft size={20} />
             </button>
            <button
                type="submit"
                disabled={isLoading || !adminRoomCode}
                className="flex-1 text-white bg-rose-600 hover:bg-rose-700 shadow-rose-200 py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
                {isLoading ? "Joining..." : "Join Room"}
            </button>
        </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 transition-all duration-300 relative overflow-hidden">
        
        <div className={`absolute top-0 left-0 w-full h-2 ${isAdminMode ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>

        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${isAdminMode ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
            {isAdminMode ? <ShieldCheck size={32} /> : <UserCircle2 size={32} />}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isAdminMode ? 'Admin Control' : 'WordCloud กิจกรรมเสาร์สิ้นเดือนมกราคม 2026'}
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            {isAdminMode ? 'จัดการกิจกรรม' : 'เข้าร่วมกิจกรรม'}
          </p>
        </div>

        {/* --- MAIN CONTENT AREA --- */}
        {isAdminMode ? (
            <>
                {adminStep === 'AUTH' && renderAdminAuth()}
                {adminStep === 'CHOICE' && renderAdminChoice()}
                {adminStep === 'JOIN_ROOM' && renderAdminJoinRoom()}
            </>
        ) : (
            <form onSubmit={handleUserLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">ชื่อเล่นของคุณ</label>
                <div className="relative">
                  <UserCircle2 className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="เช่น มิ้นท์, บอย"
                    maxLength={15}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">เลขห้อง (Room ID)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  <input
                    type="tel"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-lg tracking-widest transition-all"
                    placeholder="0000"
                    maxLength={4}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !nickname.trim() || !roomCode.trim()}
                className="w-full text-white bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg mt-4 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <>
                    <span>เข้าร่วม</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>
        )}

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <button 
            onClick={toggleAdminMode}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            {isAdminMode ? 'กลับไปหน้าผู้ใช้งาน' : 'เข้าสู่ระบบ Admin'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;