import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, WordEntry, WheelState, DBSession, DBRoom, Session } from './types';
import WordCloudChart from './components/WordCloudChart';
import WordList from './components/WordList';
import LoginScreen from './components/LoginScreen';
import RandomWheel from './components/RandomWheel';
import SessionHistory from './components/SessionHistory';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { normalizeForGrouping, getBestDisplayText, generateId } from './utils/textUtils';
import { 
  Cloud, 
  List, 
  Send, 
  BarChart3,
  LogOut,
  User,
  Settings,
  Eye,
  EyeOff,
  Dices,
  Merge,
  PlusCircle,
  History,
  Check,
  X as XIcon,
  Hash,
  HelpCircle,
  Trash2,
  Edit3,
  Lock,
  RefreshCw
} from 'lucide-react';

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // New Structure: Room (Persistent) vs Session (Ephemeral Question)
  const [currentRoom, setCurrentRoom] = useState<DBRoom | null>(null);
  const [currentSession, setCurrentSession] = useState<DBSession | null>(null);
  
  // --- App Data ---
  const [words, setWords] = useState<WordEntry[]>([]);
  const [topic, setTopic] = useState<string>('');
  
  // Controls visibility of results for everyone (Synced via Broadcast)
  const [showResults, setShowResults] = useState<boolean>(false);
  
  // Track user's submission for the current session
  const [mySubmission, setMySubmission] = useState<WordEntry | null>(null);
  
  // --- Wheel State ---
  const [wheelState, setWheelState] = useState<WheelState>({
    isOpen: false,
    isSpinning: false,
    currentResult: null,
    history: [],
    min: 1,
    max: 40
  });
  
  // --- UI State ---
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CLOUD);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // "New Question" UI
  const [creatingNewQuestion, setCreatingNewQuestion] = useState(false);
  const [newQuestionTopic, setNewQuestionTopic] = useState('');
  
  // --- Admin UI State ---
  const [adminSelectedIds, setAdminSelectedIds] = useState<string[]>([]);
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [tempTopic, setTempTopic] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);

  // --- Helpers ---
  
  // Fetch Words for the Current Session
  const fetchWords = useCallback(async () => {
    if (!currentSession || !isSupabaseConfigured()) return;

    // Fetch data specifically for this session
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('session_id', currentSession.id);

    if (error) {
      console.error('Error fetching words:', error);
    } else if (data) {
      const formattedData: WordEntry[] = data.map((item: any) => ({
        id: item.id,
        text: item.text,
        normalizedText: item.normalized_text,
        count: item.count,
        submittedBy: item.submitted_by || [], // Ensure array
        sessionId: item.session_id
      }));
      setWords(formattedData);
    }
  }, [currentSession]);

  // Update mySubmission whenever words change
  useEffect(() => {
    if (currentUser) {
      const found = words.find(w => w.submittedBy.includes(currentUser));
      setMySubmission(found || null);
    }
  }, [words, currentUser]);

  // --- Initialize & Realtime ---

  // 1. Listen for SESSION changes within the current ROOM
  // (This detects when Admin creates a "New Question")
  useEffect(() => {
    if (!currentRoom || !isSupabaseConfigured()) return;

    // Listen to changes in 'sessions' table where room_id matches
    const roomChannel = supabase
      .channel(`room_updates_${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'sessions',
            filter: `room_id=eq.${currentRoom.id}`
        },
        (payload) => {
            const newSession = payload.new as DBSession;
            // If a new active session is created, switch to it automatically
            if (newSession.is_active) {
                console.log("New Session Detected!", newSession);
                setCurrentSession(newSession);
                setTopic(newSession.topic);
                setWords([]); // Clear words for new question
                setMySubmission(null);
                setShowResults(false); // Reset visibility for new question
            }
        }
      )
      .on(
          'postgres_changes',
          {
              event: 'UPDATE',
              schema: 'public',
              table: 'sessions',
              filter: `room_id=eq.${currentRoom.id}`
          },
          (payload) => {
              // Handle topic updates for current session
              if (currentSession && payload.new.id === currentSession.id) {
                  const updatedSession = payload.new as DBSession;
                  if (updatedSession.topic !== topic) {
                      setTopic(updatedSession.topic);
                  }
              }
          }
      )
      .subscribe();

    return () => {
        supabase.removeChannel(roomChannel);
    };
  }, [currentRoom, currentSession, topic]);


  // 2. Listen for WORD changes within the current SESSION + POLLING BACKUP
  useEffect(() => {
    if (!currentSession || !isSupabaseConfigured()) return;

    // Initial load
    fetchWords();
    setTopic(currentSession.topic);

    // Subscribe to ALL word changes
    // Using a specific channel name for this session to ensure uniqueness
    const channelId = `words_session_${currentSession.id}`;
    const wordChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'words',
        },
        () => {
             fetchWords();
        }
      )
      .subscribe();

    // --- POLLING BACKUP ---
    // Fetch every 3 seconds to ensure admin sees data even if Realtime misses an event
    const intervalId = setInterval(() => {
      fetchWords();
    }, 3000);

    return () => {
      supabase.removeChannel(wordChannel);
      clearInterval(intervalId);
    };
  }, [currentSession, fetchWords]);

  // 3. Wheel Sync & Show/Hide Sync (Per Room)
  useEffect(() => {
    if (!isSupabaseConfigured() || !currentRoom) return;
    
    const channelName = `room_control_${currentRoom.code}`;
    const channel = supabase.channel(channelName);
    
    channel.on('broadcast', { event: 'wheel_update' }, (payload) => {
      if (payload.payload) {
        setWheelState(payload.payload);
      }
    })
    .on('broadcast', { event: 'ui_state_update' }, (payload) => {
      if (payload.payload && typeof payload.payload.showResults !== 'undefined') {
        setShowResults(payload.payload.showResults);
      }
    })
    .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom]);

  // Fetch History (Admin only)
  useEffect(() => {
    if (showHistory && isSupabaseConfigured() && currentRoom) {
       const loadHistory = async () => {
         // Get sessions for THIS room
         const { data: sessionsData, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('room_id', currentRoom.id)
            .order('created_at', { ascending: false });

         if (error) {
             alert("ไม่สามารถดึงประวัติได้: " + error.message);
             return;
         }
         if (!sessionsData) return;

         const sessionIds = sessionsData.map(s => s.id);
         const { data: wordsData } = await supabase.from('words').select('*').in('session_id', sessionIds);

         const mappedSessions: Session[] = sessionsData.map((s: any) => ({
           id: s.id,
           timestamp: new Date(s.created_at).getTime(),
           topic: s.topic,
           words: wordsData 
             ? wordsData.filter((w: any) => w.session_id === s.id).map((item: any) => ({
                 id: item.id,
                 text: item.text,
                 normalizedText: item.normalized_text,
                 count: item.count,
                 submittedBy: item.submitted_by || [],
                 sessionId: item.session_id
               })) 
             : []
         }));

         setSessionHistory(mappedSessions);
       };
       loadHistory();
    }
  }, [showHistory, currentRoom]);

  // --- Actions ---

  const handleLogin = (nickname: string, adminMode: boolean, roomData: DBRoom, initialSession: DBSession | null) => {
    localStorage.setItem('cloudmind_user', nickname);
    setCurrentUser(nickname);
    setIsAdmin(adminMode);
    setCurrentRoom(roomData);
    setCurrentSession(initialSession); // Can be null if room has no active session
    if (initialSession) {
        setTopic(initialSession.topic);
    } else {
        setTopic("รอคำถามจาก Admin...");
    }
    
    // Default showResults to false for users (wait for reveal), true for admin initially or sync
    // In a real app we'd fetch the current state from DB, but broadcast is fine for now
    setShowResults(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('cloudmind_user');
    setCurrentUser(null);
    setIsAdmin(false);
    setCurrentRoom(null);
    setCurrentSession(null);
    setWords([]);
  };

  // Broadcast showResults state to everyone
  const toggleShowResults = () => {
    const newState = !showResults;
    setShowResults(newState);
    
    if (currentRoom) {
      supabase.channel(`room_control_${currentRoom.code}`).send({
        type: 'broadcast',
        event: 'ui_state_update',
        payload: { showResults: newState }
      });
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !currentUser || !currentSession || !currentRoom) return;
    if (!isSupabaseConfigured()) {
        alert("กรุณาเชื่อมต่อ Supabase");
        return;
    }

    // Check strict rule: If results shown, NO editing allowed
    if (mySubmission && showResults) {
      alert("หมดเวลาแก้ไขคำตอบแล้ว");
      return;
    }

    setIsLoading(true);
    const rawText = inputValue.trim();
    const normalizedKey = normalizeForGrouping(rawText);

    try {
        // --- 1. Handle Previous Submission (EDIT MODE) ---
        if (mySubmission) {
           // Prevent redundant update
           if (normalizeForGrouping(mySubmission.text) === normalizedKey) {
              setInputValue('');
              setIsLoading(false);
              return;
           }

           // Remove user from old word
           const newSubmitters = mySubmission.submittedBy.filter(u => u !== currentUser);
           const newCount = Math.max(0, mySubmission.count - 1);

           if (newCount === 0) {
              // Delete word if no submitters left
              const { error: delError } = await supabase
                .from('words')
                .delete()
                .eq('id', mySubmission.id);
              if (delError) throw delError;
           } else {
              // Update word count
              const { error: upError } = await supabase
                .from('words')
                .update({ 
                  count: newCount,
                  submitted_by: newSubmitters
                })
                .eq('id', mySubmission.id);
              if (upError) throw upError;
           }
        }

        // --- 2. Add/Update New Word ---
        const { data: existingWords, error: checkError } = await supabase
            .from('words')
            .select('*')
            .eq('session_id', currentSession.id)
            .eq('normalized_text', normalizedKey)
            .limit(1);

        if (checkError) throw checkError;

        if (existingWords && existingWords.length > 0) {
            const existing = existingWords[0];
            const newText = getBestDisplayText(existing.text, rawText);
            const newSubmitters = [...(existing.submitted_by || []), currentUser];
            
            const { error: updateError } = await supabase
                .from('words')
                .update({ 
                    count: existing.count + 1,
                    text: newText,
                    submitted_by: newSubmitters
                })
                .eq('id', existing.id);
            
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from('words')
                .insert({
                    id: generateId(),
                    session_id: currentSession.id,
                    text: rawText,
                    normalized_text: normalizedKey,
                    count: 1,
                    submitted_by: [currentUser]
                });
            
            if (insertError) throw insertError;
        }

        setInputValue('');
        fetchWords(); 
        
    } catch (err: any) {
        console.error(err);
        alert("ส่งคำตอบไม่สำเร็จ: " + err.message);
    } finally {
        setIsLoading(false);
    }
  };

  const performNewQuestion = async () => {
    if (!isSupabaseConfigured() || !isAdmin || !currentRoom) return;
    if (!newQuestionTopic.trim()) {
        alert("กรุณาใส่หัวข้อคำถาม");
        return;
    }
    
    try {
        // 1. Create New Session in DB linked to current ROOM
        const { data: newSession, error } = await supabase
          .from('sessions')
          .insert({
            room_id: currentRoom.id,
            room_code: currentRoom.code, // Keep this for sessions table if needed
            topic: newQuestionTopic.trim(),
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // 2. State will automatically update via Realtime Subscription in useEffect
        // But we set it here locally for instant feedback
        setCurrentSession(newSession);
        setTopic(newQuestionTopic.trim());
        setWords([]);
        setMySubmission(null);
        setShowResults(false);
        
        // Broadcast hiding results
        if (currentRoom) {
          supabase.channel(`room_control_${currentRoom.code}`).send({
            type: 'broadcast',
            event: 'ui_state_update',
            payload: { showResults: false }
          });
        }

        // Reset UI
        setCreatingNewQuestion(false);
        setNewQuestionTopic('');
        setWheelState(prev => ({ ...prev, isOpen: false, history: [], currentResult: null }));

    } catch (err: any) {
        alert("สร้างคำถามใหม่ไม่สำเร็จ: " + err.message);
    }
  };

  const syncWheel = (newState: WheelState) => {
    setWheelState(newState);
    if (isSupabaseConfigured() && currentRoom) {
        supabase.channel(`room_control_${currentRoom.code}`).send({
            type: 'broadcast',
            event: 'wheel_update',
            payload: newState,
        });
    }
  };

  const updateTopic = async () => {
    if (!currentSession) return;
    const { error } = await supabase
      .from('sessions')
      .update({ topic: tempTopic })
      .eq('id', currentSession.id);
    
    if (error) {
        alert("เปลี่ยนหัวข้อไม่สำเร็จ: " + error.message);
    } else {
      setTopic(tempTopic);
      setIsEditingTopic(false);
    }
  };

  const mergeSelectedWords = async () => {
    if (adminSelectedIds.length < 2 || !currentSession || !currentRoom) return;
    setIsLoading(true);

    try {
        // 1. Fetch Fresh Data (Crucial: Avoid stale state)
        const { data: freshWords, error: fetchError } = await supabase
            .from('words')
            .select('*')
            .in('id', adminSelectedIds)
            .eq('session_id', currentSession.id);

        if (fetchError) throw new Error("ดึงข้อมูลล่าสุดไม่สำเร็จ: " + fetchError.message);
        if (!freshWords || freshWords.length < 2) {
            alert("คำที่เลือกอาจถูกลบไปแล้ว กรุณาลองใหม่อีกครั้ง");
            setAdminSelectedIds([]);
            fetchWords();
            setIsLoading(false);
            return;
        }

        // 2. Prepare Merge Data
        // Sort by count desc to order the name "A + B"
        const sortedFresh = freshWords.sort((a, b) => b.count - a.count);
        const combinedText = sortedFresh.map(w => w.text).join(" + ");
        const totalCount = freshWords.reduce((sum, w) => sum + w.count, 0);
        // Combine submitters safely
        const allSubmitters = freshWords.flatMap(w => w.submitted_by || []);

        if (!window.confirm(`ยืนยันการรวมคำ:\n\n${sortedFresh.map(w => `- ${w.text} (${w.count})`).join('\n')}\n\nกลายเป็น:\n"${combinedText}"`)) {
            setIsLoading(false);
            return;
        }

        // 3. Insert NEW Word (Create new unified entry)
        // We use insert instead of update to ensure a clean state
        const newId = generateId();
        const newNormalized = normalizeForGrouping(combinedText);

        const { error: insertError } = await supabase.from('words').insert({
            id: newId,
            session_id: currentSession.id,
            text: combinedText,
            normalized_text: newNormalized,
            count: totalCount,
            submitted_by: allSubmitters
        });

        if (insertError) {
            // Handle unique violation if "A + B" already exists (but wasn't selected)
            if (insertError.code === '23505') { // Unique constraint violation code
                 alert("มีคำว่า '" + combinedText + "' อยู่แล้วในระบบ ไม่สามารถรวมได้ (ชื่อซ้ำ)");
            } else {
                 throw new Error("สร้างคำใหม่ไม่สำเร็จ: " + insertError.message);
            }
            setIsLoading(false);
            return; 
        }

        // 4. Delete OLD Words
        // Only if insert succeeded.
        const { error: delError } = await supabase
            .from('words')
            .delete()
            .in('id', adminSelectedIds);

        if (delError) {
             // Weird state: New word created, but old ones not deleted.
             // We can live with this (duplicates) better than losing data, but let's warn.
             alert("คำเตือน: สร้างคำใหม่แล้ว แต่ลบคำเดิมไม่สำเร็จ (" + delError.message + ")");
        }

        // 5. Cleanup
        setAdminSelectedIds([]);
        fetchWords();
        
    } catch (err: any) {
        console.error("Merge Failed:", err);
        alert("เกิดข้อผิดพลาดในการรวมคำ: " + err.message);
    } finally {
        setIsLoading(false);
    }
  };
  
  const deleteSelectedWords = async () => {
    if (adminSelectedIds.length === 0 || !currentSession) return;
    if (!window.confirm(`ลบ ${adminSelectedIds.length} รายการที่เลือก?`)) return;
    
    setIsLoading(true);
    try {
        const { error } = await supabase
            .from('words')
            .delete()
            .in('id', adminSelectedIds);
            
        if (error) throw error;
        setAdminSelectedIds([]);
        fetchWords();
    } catch(err: any) {
        alert("ลบไม่สำเร็จ: " + err.message);
    } finally {
        setIsLoading(false);
    }
  };

  const toggleAdminSelection = (id: string) => {
    setAdminSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  // --- Render ---

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!isSupabaseConfigured()) {
     return <div className="p-10 text-center">Please configure Supabase API Key</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-40 relative">
      
      {/* --- Header --- */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white ${isAdmin ? 'bg-rose-600' : 'bg-indigo-600'}`}>
                  {isAdmin ? <Settings size={14} /> : <BarChart3 size={14} />}
                </div>
                <h1 className="font-bold text-slate-800 tracking-tight text-sm md:text-lg truncate max-w-[200px] md:max-w-md">WordCloud กิจกรรมเสาร์สิ้นเดือนมกราคม 2026</h1>
                <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold text-slate-600 border border-slate-200">
                   <Hash size={10} /> {currentRoom?.code}
                </div>
              </div>
              
              {isAdmin && isEditingTopic ? (
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={tempTopic}
                    onChange={(e) => setTempTopic(e.target.value)}
                    className="flex-1 bg-white border border-indigo-300 rounded px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button onClick={updateTopic} className="text-xs bg-green-500 text-white px-3 rounded">Save</button>
                  <button onClick={() => setIsEditingTopic(false)} className="text-xs text-slate-500 px-2">Cancel</button>
                </div>
              ) : (
                <h2 
                  className={`text-slate-600 text-sm md:text-base ${isAdmin ? 'cursor-pointer hover:text-indigo-600 hover:underline decoration-dashed' : ''}`}
                  onClick={() => { if(isAdmin) { setTempTopic(topic); setIsEditingTopic(true); } }}
                >
                  {topic || "รอคำถาม..."}
                </h2>
              )}
            </div>
            
            <div className="flex items-center gap-2 justify-end">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                <User size={14} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700 max-w-[80px] truncate">{currentUser}</span>
              </div>
              {isAdmin && (
                <button onClick={() => setShowHistory(true)} className="text-slate-400 hover:text-indigo-600 p-2" title="ประวัติ">
                  <History size={18} />
                </button>
              )}
              <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 p-2" title="ออก">
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Admin Toolbar */}
          {isAdmin && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
               {/* NEW QUESTION (Session) BUTTON */}
               {creatingNewQuestion ? (
                 <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1 rounded-md flex-grow md:flex-grow-0 animate-in fade-in">
                    <input 
                        type="text"
                        placeholder="หัวข้อคำถามใหม่..."
                        className="text-xs border border-indigo-200 rounded px-2 py-1 w-32 md:w-48 focus:outline-none focus:border-indigo-500"
                        value={newQuestionTopic}
                        onChange={(e) => setNewQuestionTopic(e.target.value)}
                        autoFocus
                    />
                    <button onClick={performNewQuestion} className="bg-indigo-600 text-white p-1 rounded hover:bg-indigo-700"><Check size={14} /></button>
                    <button onClick={() => setCreatingNewQuestion(false)} className="bg-white border border-indigo-200 text-indigo-700 p-1 rounded hover:bg-indigo-50"><XIcon size={14} /></button>
                 </div>
               ) : (
                 <button onClick={() => setCreatingNewQuestion(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">
                  <PlusCircle size={16} /> คำถามใหม่
                </button>
               )}

              <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

              <button 
                onClick={toggleShowResults}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showResults ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {showResults ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="hidden sm:inline">{showResults ? 'แสดงคำตอบ' : 'ซ่อนคำตอบ'}</span>
              </button>

              <button 
                onClick={() => syncWheel({ ...wheelState, isOpen: true })}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
              >
                <Dices size={16} /> <span className="hidden sm:inline">สุ่ม</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="w-full max-w-3xl px-4 py-6 space-y-6 flex-grow">
        
        {/* Waiting State */}
        {!currentSession ? (
             <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
               <HelpCircle size={48} className="text-slate-300 mb-4" />
               <h3 className="text-xl font-bold text-slate-600">รอผู้ดูแลตั้งคำถาม...</h3>
               <p className="text-slate-400 text-sm mt-2">คุณอยู่ในห้อง: {currentRoom?.code}</p>
             </div>
        ) : !isAdmin && !showResults ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-sm w-full">
                <h3 className="text-xl font-bold text-slate-800 mb-2 text-center">รอเปิดคำตอบ...</h3>
                <p className="text-slate-500 text-center mb-6">ผู้ดูแลยังไม่แสดงผลลัพธ์</p>
                
                {mySubmission ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center animate-pulse">
                        <p className="text-xs text-amber-600 font-bold uppercase mb-1">คุณตอบไปแล้ว</p>
                        <p className="text-lg font-bold text-slate-800">"{mySubmission.text}"</p>
                        <p className="text-xs text-slate-400 mt-2">คุณสามารถแก้ไขคำตอบได้ด้านล่าง</p>
                    </div>
                ) : (
                    <div className="flex justify-center text-slate-300">
                        <Send size={48} />
                    </div>
                )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex bg-slate-200 p-1 rounded-lg w-fit mx-auto shadow-inner items-center justify-between">
              <div className="flex">
                <button onClick={() => setViewMode(ViewMode.CLOUD)} className={`flex gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.CLOUD ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                    <Cloud size={16} /> Cloud
                </button>
                <button onClick={() => setViewMode(ViewMode.LIST)} className={`flex gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.LIST ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                    <List size={16} /> List
                </button>
              </div>
              <button onClick={() => fetchWords()} className="text-slate-400 hover:text-indigo-600 p-2" title="รีเฟรชข้อมูล">
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="transition-all duration-300">
              {viewMode === ViewMode.CLOUD ? (
                <WordCloudChart data={words} />
              ) : (
                <WordList 
                  words={words} 
                  isAdmin={isAdmin}
                  selectedIds={adminSelectedIds}
                  onToggleSelect={toggleAdminSelection}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* --- ADMIN ACTION BAR (Floating Bottom) --- */}
      {isAdmin && adminSelectedIds.length > 0 && viewMode === ViewMode.LIST && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-6 border border-slate-700 w-[90%] max-w-md">
            <div className="flex-1">
                <span className="block text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">เลือกแล้ว</span>
                <span className="text-xl font-bold text-white">{adminSelectedIds.length} รายการ</span>
            </div>
            <div className="flex gap-3">
                <button 
                  onClick={deleteSelectedWords}
                  className="bg-slate-800 hover:bg-slate-700 text-rose-400 p-3 rounded-xl transition-colors"
                  title="ลบ"
                >
                    <Trash2 size={20} />
                </button>
                <button 
                  onClick={mergeSelectedWords}
                  disabled={adminSelectedIds.length < 2 || isLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/50"
                >
                    <Merge size={20} />
                    <span>รวมคำ</span>
                </button>
                <button 
                  onClick={() => setAdminSelectedIds([])}
                  className="absolute -top-3 -right-3 bg-slate-200 text-slate-600 rounded-full p-1 shadow-md hover:bg-white transition-colors"
                >
                    <XIcon size={16} />
                </button>
            </div>
        </div>
      )}

      {/* --- User Input Footer --- */}
      {currentSession && !isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40">
            <div className="max-w-3xl mx-auto">
                {mySubmission && (
                    <div className={`mb-2 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-medium ${showResults ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        <span>คุณตอบว่า: <strong>{mySubmission.text}</strong></span>
                        <span>{showResults ? <span className="flex items-center gap-1"><Check size={12}/> บันทึกแล้ว</span> : <span className="flex items-center gap-1"><Edit3 size={12}/> แก้ไขได้</span>}</span>
                    </div>
                )}
                
                <form onSubmit={handleAddWord} className="flex gap-3">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={mySubmission ? "แก้ไขคำตอบ..." : `พิมพ์คำตอบ (${currentUser})...`}
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all ${
                                (mySubmission && showResults) 
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                                : 'bg-slate-50 border-slate-300'
                            }`}
                            maxLength={30}
                            disabled={isLoading || (!!mySubmission && showResults)}
                        />
                        {mySubmission && showResults && (
                            <Lock className="absolute right-3 top-3.5 text-slate-400" size={18} />
                        )}
                    </div>
                    
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading || (!!mySubmission && showResults)}
                        className={`text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none ${
                             mySubmission ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                        }`}
                    >
                        {mySubmission ? (
                            showResults ? <Lock size={18} /> : <span className="whitespace-nowrap">แก้ไข</span>
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
            </div>
        </div>
      )}

      {wheelState.isOpen && (
        <RandomWheel 
          isAdmin={isAdmin} 
          state={wheelState} 
          onUpdateState={(p) => syncWheel({ ...wheelState, ...p })}
          onClose={() => syncWheel({ ...wheelState, isOpen: false })} 
        />
      )}

      {showHistory && <SessionHistory sessions={sessionHistory} onClose={() => setShowHistory(false)} />}
    </div>
  );
};

export default App;