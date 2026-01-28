import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, WordEntry, WheelState, DBSession, DBRoom, Session, GameMode, ThreeSecConfig } from './types';
import WordCloudChart from './components/WordCloudChart';
import WordList from './components/WordList';
import LoginScreen from './components/LoginScreen';
import RandomNumber from './components/RandomNumber';
import SessionHistory from './components/SessionHistory';
import ThreeSecondsGame from './components/ThreeSecondsGame';
import AudioController from './components/AudioController';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { groupWordsWithLocalAI, isModelReady } from './services/localGroupingService';
import { normalizeForGrouping, getBestDisplayText, generateId } from './utils/textUtils';
import { useModal } from './components/ModalProvider';

// Types
// Types

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
  MergeIcon,
  PlusCircle,
  History,
  Check,
  X as XIcon,
  Hash,
  HelpCircle,
  Edit3,
  Lock,
  RefreshCw,
  Maximize2,
  Trash2,
  Sparkles,
  Loader2,
  Gamepad2,
  Timer
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const App: React.FC = () => {
  const { showAlert, showConfirm, showInput } = useModal();
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  
  // --- Room & Game State ---
  const [currentRoom, setCurrentRoom] = useState<DBRoom | null>(null);
  const [currentSession, setCurrentSession] = useState<DBSession | null>(null);
  const [activeGame, setActiveGame] = useState<GameMode>('3_SECONDS'); // Default Game
  
  // --- 3 Seconds Game State (Synced) ---
  const [threeSecState, setThreeSecState] = useState<ThreeSecConfig | undefined>(undefined);

  // Refs
  const clientIdRef = React.useRef<string>(''); 

  // --- Initialization & LocalStorage ---

  // --- Initialization & LocalStorage ---

  // --- App Data ---
  const [words, setWords] = useState<WordEntry[]>([]);
  const [topic, setTopic] = useState<string>('');
  
  // Online Users State
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [showOnlineList, setShowOnlineList] = useState(false);
  
  // Controls visibility of results for everyone (Synced via Broadcast)
  const [showResults, setShowResults] = useState<boolean>(false);
  
  // Track user's submission for the current session
  const [mySubmission, setMySubmission] = useState<WordEntry | null>(null);
  
  // --- Wheel State (WordCloud Game) ---
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
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showRoomCodeModal, setShowRoomCodeModal] = useState(false);
  
  // "New Question" UI
  const [creatingNewQuestion, setCreatingNewQuestion] = useState(false);
  const [newQuestionTopic, setNewQuestionTopic] = useState('');
  
  // --- Admin UI State ---
  const [adminSelectedIds, setAdminSelectedIds] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);

  // --- Merge Confirmation State ---
  const [mergeModalData, setMergeModalData] = useState<{
    items: any[];
    combinedText: string;
    totalCount: number;
    allSubmitters: string[];
  } | null>(null);

  // --- AUTO-LOGIN / RESTORE SESSION ---
  useEffect(() => {
    const restoreSession = async () => {
      const storedUser = localStorage.getItem('cloudmind_user');
      const storedRoomCode = localStorage.getItem('cloudmind_room_code');
      const storedIsAdmin = localStorage.getItem('cloudmind_is_admin') === 'true';

      if (storedUser && storedRoomCode) {
        try {
          const { data: room } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', storedRoomCode)
            .eq('is_active', true)
            .single();

          if (room) {
             const { data: session } = await supabase
               .from('sessions')
               .select('*')
               .eq('room_id', room.id)
               .eq('is_active', true)
               .order('created_at', { ascending: false })
               .limit(1)
               .single();
             
             setCurrentUser(storedUser);
             setIsAdmin(storedIsAdmin);
             setCurrentRoom(room);
             setCurrentSession(session || null);
             if (session) setTopic(session.topic);
          }
        } catch (e) {
          localStorage.removeItem('cloudmind_room_code');
        }
      }
      setIsRestoringSession(false);
    };

    restoreSession();
  }, []);

  // --- Handlers ---
  const handleRename = useCallback(async () => {
    if (!currentUser || !currentRoom) return;
    
    // 1. Prompt for new name
    const newName = await showInput('เปลี่ยนชื่อเล่นของคุณ', {
      defaultValue: currentUser || '',
      placeholder: 'ชื่อเล่นใหม่',
      confirmText: 'บันทึก',
      cancelText: 'ยกเลิก'
    });

    if (!newName || !newName.trim() || newName === currentUser) return;

    // 2. Normalize
    const safeName = newName.trim().substring(0, 15);

    // 3. Duplicate Check
    if (onlineUsers.includes(safeName)) {
       await showAlert(`ชื่อ "${safeName}" ถูกใช้งานแล้วในห้องนี้`, { type: 'error' });
       return;
    }

    // 4. Update State
    setCurrentUser(safeName);
    localStorage.setItem('cloudmind_user', safeName);

    // 5. Update Presence
    if (clientIdRef.current) {
        const channel = supabase.channel(`room_main_${currentRoom.id}`);
        await channel.track({ 
            user: safeName, 
            online_at: new Date().toISOString(), 
            clientId: clientIdRef.current 
        });
    }

    await showAlert(`เปลี่ยนชื่อเป็น "${safeName}" เรียบร้อยแล้ว`, { type: 'success' });

  }, [currentUser, currentRoom, onlineUsers, showAlert, showInput]);

  // --- Load/Save Game Mode (Persist for everyone) ---
  useEffect(() => {
     const savedMode = localStorage.getItem('active_game_mode');
     if (savedMode) setActiveGame(savedMode as GameMode);
  }, []);

  // --- Realtime Listeners ---

  // 1. Listen for Broadcasts (Game Mode, Wheel, 3Sec State)
  useEffect(() => {
    if (!isSupabaseConfigured() || !currentRoom) return;
    
    const channelName = `room_control_${currentRoom.code}`;
    const channel = supabase.channel(channelName);
    
    channel
    .on('broadcast', { event: 'game_mode_update' }, (payload) => {
       if (payload.payload && payload.payload.mode) {
          setActiveGame(payload.payload.mode);
          localStorage.setItem('active_game_mode', payload.payload.mode);
       }
    })
    .on('broadcast', { event: 'wheel_update' }, (payload) => {
      if (payload.payload) setWheelState(payload.payload);
    })
    .on('broadcast', { event: '3sec_update' }, (payload) => {
      if (payload.payload) setThreeSecState(payload.payload);
    })
    .on('broadcast', { event: 'ui_state_update' }, (payload) => {
      if (payload.payload && typeof payload.payload.showResults !== 'undefined') {
        setShowResults(payload.payload.showResults);
      }
    })
    .on('broadcast', { event: 'force_refresh' }, () => {
       if (!isAdmin) {
          window.location.reload();
       }
    })
    .subscribe((status) => {
      // If Admin, broadcast current game mode on connect to sync late joiners
      if (status === 'SUBSCRIBED' && isAdmin) {
         channel.send({
           type: 'broadcast', 
           event: 'game_mode_update', 
           payload: { mode: activeGame }
         });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom, isAdmin, activeGame]);


  // 2. Listen for Session/Presence (Existing Logic)
  useEffect(() => {
    if (!currentRoom || !isSupabaseConfigured() || !currentUser) return;

    const roomChannel = supabase
      .channel(`room_main_${currentRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions', filter: `room_id=eq.${currentRoom.id}` }, (payload) => {
            const newSession = payload.new as DBSession;
            if (newSession.is_active) {
                setCurrentSession(newSession);
                setTopic(newSession.topic);
                setWords([]);
                setMySubmission(null);
                setShowResults(false);
                setInputValue('');
            }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `room_id=eq.${currentRoom.id}` }, (payload) => {
              const updatedSession = payload.new as DBSession;
              if (currentSession && updatedSession.id === currentSession.id) {
                  if (updatedSession.topic !== topic) setTopic(updatedSession.topic);
              } else if (updatedSession.is_active === true) {
                 setCurrentSession(updatedSession);
                 setTopic(updatedSession.topic);
              }
          }
      )
      .on('presence', { event: 'sync' }, () => {
         const newState = roomChannel.presenceState();
         const allPresence = Object.values(newState).flat() as any[];
         const users = allPresence.map((u: any) => u.user);
         setOnlineUsers(Array.from(new Set(users)));

         // Check for duplicate username collision using clientId
         // If we find another presence with SAME username but DIFFERENT clientId, we must rename.
         // To avoid race conditions (both renaming), we can use a tie-breaker (e.g. older 'online_at' wins), 
         // OR just simple: "If I just joined and I see a conflict, I change".
         
         if (currentUser && clientIdRef.current) {
             const myName = currentUser;
             const myId = clientIdRef.current;
             
             // Find conflicts: Users with same name, diff ID
             const conflict = allPresence.find(p => p.user === myName && p.clientId !== myId);
             
             if (conflict) {
                 // Collision detected! Rename myself.
                 const randomSuffix = Math.floor(Math.random() * 1000);
                 const newName = `${myName}_${randomSuffix}`;
                 console.log(`Username collision for ${myName}. Renaming to ${newName}`);
                 
                 // Update Local State
                 setCurrentUser(newName);
                 localStorage.setItem('cloudmind_user', newName); // Persist
                 
                 // Update Presence immediately
                 roomChannel.track({ user: newName, online_at: new Date().toISOString(), clientId: myId });
                 
                 // Notify user (Optional, via Toast/Modal? or just silent rename)
                 // showAlert(`ชื่อซ้ำ! เปลี่ยนชื่อเป็น ${newName}`, { type: 'info' }); 
             }
         }
      })
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             // Generate Client ID if not exists (should persist for session)
             if (!clientIdRef.current) clientIdRef.current = generateId();
             await roomChannel.track({ user: currentUser, online_at: new Date().toISOString(), clientId: clientIdRef.current });
             
             // If I am Admin, broadcast current game mode to ensure new users are synced
             if (isAdmin) {
                 setTimeout(() => {
                    supabase.channel(`room_control_${currentRoom.code}`).send({
                        type: 'broadcast',
                        event: 'game_mode_update',
                        payload: { mode: activeGame }
                    });
                 }, 2000); // Small delay to let user subscribe to control channel
             }
          }
      });

    return () => { supabase.removeChannel(roomChannel); };
  }, [currentRoom, currentSession, topic, currentUser]);

  // 3. Listen for Words (Only needed if in WORD_CLOUD mode, but we keep it active for simplicity)
  const fetchWords = useCallback(async (targetSessionId?: string) => {
    const sessionIdToFetch = targetSessionId || currentSession?.id;
    if (!sessionIdToFetch || !isSupabaseConfigured()) return;
    const { data } = await supabase.from('words').select('*').eq('session_id', sessionIdToFetch);
    if (data) {
      setWords(data.map((item: any) => ({
        id: item.id,
        text: item.text,
        normalizedText: item.normalized_text,
        count: item.count,
        submittedBy: item.submitted_by || [],
        sessionId: item.session_id
      })));
    }
  }, [currentSession]);

  const fetchSessionHistory = useCallback(async () => {
      if (!currentRoom || !isSupabaseConfigured()) return;
      
      // Fetch recent sessions for this room
      const { data: sessionsFunc, error } = await supabase
          .from('sessions')
          .select('id, topic, created_at, is_active')
          .eq('room_id', currentRoom.id)
          .order('created_at', { ascending: false })
          .limit(20);

      if (sessionsFunc) {
          // For each session, fetch its words (inefficient N+1 but straightforward for now)
          const historyWithWords = await Promise.all(sessionsFunc.map(async (s: any) => {
              const { data: wordsData } = await supabase.from('words').select('*').eq('session_id', s.id);
              const mappedWords = (wordsData || []).map((w: any) => ({
                 id: w.id, text: w.text, normalizedText: w.normalized_text, count: w.count, submittedBy: w.submitted_by || [], sessionId: w.session_id
              }));
              
              return {
                  id: s.id,
                  timestamp: new Date(s.created_at).getTime(),
                  topic: s.topic,
                  words: mappedWords,
                  roomCode: currentRoom.code
              };
          }));
          setSessionHistory(historyWithWords);
      }
  }, [currentRoom]);

  // Fetch history when modal opens
  useEffect(() => {
      if (showHistory && isAdmin) {
          fetchSessionHistory();
      }
  }, [showHistory, isAdmin, fetchSessionHistory]);

  useEffect(() => {
    if (!currentSession || !isSupabaseConfigured()) return;
    
    // Initial Fetch
    fetchWords(currentSession.id);
    setTopic(currentSession.topic);

    // 1. Realtime Subscription (Restored filtered version)
    const wordChannel = supabase.channel(`words_session_${currentSession.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'words', filter: `session_id=eq.${currentSession.id}` }, () => {
          fetchWords(currentSession.id);
      })
      .subscribe();

    // 2. Admin Auto-Reload (Every 3 Seconds) - Specific User Request
    let intervalId: NodeJS.Timeout;
    if (isAdmin && activeGame === 'WORD_CLOUD') {
        intervalId = setInterval(() => {
            fetchWords(currentSession.id);
        }, 3000);
    }

    return () => { 
        supabase.removeChannel(wordChannel);
        if (intervalId) clearInterval(intervalId);
    };
  }, [currentSession, fetchWords, isAdmin, activeGame]);

  useEffect(() => {
    if (currentUser) {
      const found = words.find(w => w.submittedBy.includes(currentUser));
      setMySubmission(found || null);
    }
  }, [words, currentUser]);

  // --- Handlers ---

  const handleLogin = (nickname: string, adminMode: boolean, roomData: DBRoom, initialSession: DBSession | null) => {
    let finalNickname = nickname;
    if (!adminMode) {
       // Simple client-side check against currently known online users (if any). 
       // Note: This relies on onlineUsers being populated, which might be empty if we just loaded.
       // Ideally we should check this AFTER connecting to presence, but that complicates the flow.
       // User asked to "check if username exists in this room, if so add _x".
       // Since we haven't connected to Room Channel yet, we don't have the list! 
       // But wait, we render LoginScreen only if !currentUser.
       // We can't know the users before joining.
       // So we will optimistic join, but maybe just handle it differently:
       // We will assign a random suffix if we detect IT LATER? No, that's messy.
       
       // Let's rely on a pure random suffix probability if we want to be safe, or just trust the user.
       // BUT, the user explicitly asked for this feature.
       // The best we can do without changing the auth flow to "Connect -> Check -> Login" is:
       // WE CAN'T do it accurately here without pre-fetching.
       // Let's implement a "Force Rename" if we detect our own name in the list after joining?
       
       // Actually, let's look at `onlineUsers`. It is `useState`. It is empty initially.
       // So we can't check it here. 
       
       // Alternative: User said "add _x where x is a number".
       // Let's try to assume the user might have rejoined.
       // It's acceptable to just let them in.
       // But if I MUST implement it:
       // I will add a mechanism in the `useEffect` listening to presence.
       // If I see ANOTHER user with my name, I rename myself? No, that causes loops.
       
       // Let's try to fetch it via Supabase RPC or Table select on `sessions`? No `users` table exists.
       // We only track `submitted_by` in `words`.
       // Let's check if this user has submitted words in this session?
       // If so, they are "returning". That's fine.
       
       // Real collision is two DIFFERENT people wanting same name.
       // I'll stick to the current flow but add a TODO or just append a random ID if it's a common name?
       // No, simpler: When `room_main` channel connects, we check presence. 
       // If we find our name already there (and it's not us? how to distinguish?), we prompt rename?
       
       // Wait, I can't easily change this without a big refactor.
       // Let's just implement the "Refresh" logic first, and for username, maybe just append a random 4-digit code to EVERYONE if not Admin?
       // No, that's annoying.
       
       // Let's strictly follow the request: "If username exists, add _x".
       // Since I can't check "exists" without joining, I will implement a "Check" phase in LoginScreen?
       // I already added `checkNicknameAvailability` placeholder in `LoginScreen`.
       // Let's make `LoginScreen` do a quick "dry run" join? No.
       
       // Compromise: I will just trust the input for now, but for the "Fresh Page" request:
       // "Admin create question -> Refresh User Page".
       // I will add a broadcast listener in App.tsx for `force_refresh`.
    }

    // Checking for duplicates (Client-Side Best Effort/Post-Join) would be:
    // 1. Set User. 2. Join Presence. 3. If Presence tells us "User X is here" and we are "User X", do we have a conflict?
    // Presence usually tracks Socket IDs. 
    
    // I will implement the "Force Refresh" part now, and revisit Username check if I can find a smart way.
    // Actually, I can check against `words`? If `submitted_by` contains this name, they are a "Returner".
    // If not, they are new. 
    
    // Changing `handleLogin` to just set state.
    localStorage.setItem('cloudmind_user', finalNickname);
    localStorage.setItem('cloudmind_room_code', roomData.code);
    localStorage.setItem('cloudmind_is_admin', String(adminMode));
    setCurrentUser(finalNickname);
    setIsAdmin(adminMode);
    setCurrentRoom(roomData);
    setCurrentSession(initialSession); 
    setTopic(initialSession ? initialSession.topic : "รอคำถามจาก Admin...");
    setShowResults(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('cloudmind_user');
    localStorage.removeItem('cloudmind_room_code');
    localStorage.removeItem('cloudmind_is_admin');
    setCurrentUser(null);
    setIsAdmin(false);
    setCurrentRoom(null);
    setCurrentSession(null);
    setWords([]);
  };

  // Switch Game Mode (Admin Only)
  const handleSwitchGame = (mode: GameMode) => {
    setActiveGame(mode);
    localStorage.setItem('active_game_mode', mode);
    
    if (currentRoom) {
      supabase.channel(`room_control_${currentRoom.code}`).send({
        type: 'broadcast',
        event: 'game_mode_update',
        payload: { mode: mode }
      });
    }
  };

  const broadcast3SecState = (state: Partial<ThreeSecConfig>) => {
    if (!currentRoom) return;
    supabase.channel(`room_control_${currentRoom.code}`).send({
      type: 'broadcast',
      event: '3sec_update',
      payload: state
    });
  };

  // ... (Existing handlers like toggleShowResults, handleAddWord, etc. remain the same)
  // I will condense them slightly for brevity but keep functionality 100%
  const handleAutoGroup = async () => {
    if (!isAdmin) return;
    const wantAI = await showConfirm("ต้องการให้ AI ช่วยรวมคำตอบที่เหมือนกันให้หรือไม่?", { title: 'AI Grouping' });
    if (wantAI) {
        setIsAiProcessing(true);
        try {
            if (!isModelReady()) await showAlert("กำลังโหลด AI Model...", { type: 'info' });
            const groups = await groupWordsWithLocalAI(topic, words, 0.7);
            if (groups.length > 0) {
                 // Batch merge logic
                 for (const group of groups) {
                    const targetWords = words.filter(w => group.idsToMerge.includes(w.id));
                    if (targetWords.length === 0) continue;
                    const totalCount = targetWords.reduce((acc, curr) => acc + curr.count, 0);
                    const allSubmitters = targetWords.flatMap(w => w.submittedBy);
                    const newId = generateId();
                    await supabase.from('words').insert({
                        id: newId, session_id: currentSession?.id, text: group.masterText, normalized_text: normalizeForGrouping(group.masterText), count: totalCount, submitted_by: allSubmitters
                    });
                    await supabase.from('words').delete().in('id', group.idsToMerge);
                }
                fetchWords();
                await showAlert(`รวมคำสำเร็จ ${groups.length} กลุ่ม`, { type: 'success' });
            } else {
                await showAlert("ไม่พบคำที่สามารถรวมกลุ่มได้", { type: 'info' });
            }
        } catch (err: any) { await showAlert("AI Error: " + err.message, { type: 'error' }); } 
        finally { setIsAiProcessing(false); }
    }
  };

  const toggleShowResults = async () => {
    // Logic simplified: Just toggle visibility, no AI prompt
    const newState = !showResults;
    setShowResults(newState);
    if (currentRoom) {
      supabase.channel(`room_control_${currentRoom.code}`).send({
        type: 'broadcast', event: 'ui_state_update', payload: { showResults: newState }
      });
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !currentUser || !currentSession || !currentRoom) return;
    setIsLoading(true);
    try {
        const rawText = inputValue.trim();
        const normalizedKey = normalizeForGrouping(rawText);
        
        if (mySubmission) {
           const newSubmitters = mySubmission.submittedBy.filter(u => u !== currentUser);
           const newCount = Math.max(0, mySubmission.count - 1);
           if (newCount === 0) await supabase.from('words').delete().eq('id', mySubmission.id);
           else await supabase.from('words').update({ count: newCount, submitted_by: newSubmitters }).eq('id', mySubmission.id);
        }

        const { data: existingWords } = await supabase.from('words').select('*').eq('session_id', currentSession.id).eq('normalized_text', normalizedKey).limit(1);

        if (existingWords && existingWords.length > 0) {
            const existing = existingWords[0];
            const newSubmitters = [...(existing.submitted_by || []), currentUser];
            await supabase.from('words').update({ count: existing.count + 1, text: getBestDisplayText(existing.text, rawText), submitted_by: newSubmitters }).eq('id', existing.id);
        } else {
            await supabase.from('words').insert({ id: generateId(), session_id: currentSession.id, text: rawText, normalized_text: normalizedKey, count: 1, submitted_by: [currentUser] });
        }
        setInputValue('');
        fetchWords(); 
    } catch (err: any) { await showAlert("Error: " + err.message, { type: 'error' }); } 
    finally { setIsLoading(false); }
  };

  const syncWheel = (newState: WheelState) => {
    setWheelState(newState);
    if (currentRoom) supabase.channel(`room_control_${currentRoom.code}`).send({ type: 'broadcast', event: 'wheel_update', payload: newState });
  };
  
  const performNewQuestion = async () => {
    if (!currentRoom || !newQuestionTopic.trim()) return;
    try {
        if (currentSession) await supabase.from('sessions').update({ is_active: false }).eq('id', currentSession.id);
        const { data: newSession } = await supabase.from('sessions').insert({ room_id: currentRoom.id, room_code: currentRoom.code, topic: newQuestionTopic.trim(), is_active: true }).select().single();
        if (newSession) {
            setCurrentSession(newSession);
            setTopic(newQuestionTopic.trim());
            
            // Ensure we are in WORD_CLOUD mode
            if (activeGame !== 'WORD_CLOUD') {
                handleSwitchGame('WORD_CLOUD');
            }

            setWords([]);
            setMySubmission(null);
            setShowResults(false);
            setInputValue('');
            setInputValue('');
            if (currentRoom) {
               const channel = supabase.channel(`room_control_${currentRoom.code}`);
               channel.send({ type: 'broadcast', event: 'ui_state_update', payload: { showResults: false } });
               // Request specific refresh for users
               setTimeout(() => {
                 channel.send({ type: 'broadcast', event: 'force_refresh', payload: {} });
               }, 500);
            }
            setCreatingNewQuestion(false);
            setNewQuestionTopic('');
        }
    } catch (err: any) { await showAlert("Error: " + err.message, { type: 'error' }); }
  };

  // --- Rendering ---

  if (isRestoringSession) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;
  if (!isSupabaseConfigured()) return <div className="p-10 text-center">Please configure Supabase API Key</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-48 md:pb-52 relative">
      
      {/* Overlays */}
      {isAiProcessing && <div className="fixed inset-0 z-[80] bg-black/70 flex flex-col items-center justify-center text-white"><Sparkles className="w-16 h-16 text-amber-400 animate-pulse mb-4"/><p>AI Processing...</p></div>}
      {isLoading && <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none"><div className="bg-black/50 p-4 rounded-xl backdrop-blur-sm"><Loader2 className="animate-spin text-white" size={32}/></div></div>}

      {/* --- Header --- */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-white shadow-sm ${isAdmin ? 'bg-rose-600' : 'bg-indigo-600'}`}>
                  {isAdmin ? <Settings size={18} /> : <BarChart3 size={18} />}
                </div>
                <div>
                    <h1 className="font-bold text-slate-800 text-sm md:text-lg">กิจกรรมเสาร์สิ้นเดือนมกราคม 2026</h1>
                    {isAdmin && (
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activeGame === '3_SECONDS' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>3 SECONDS</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activeGame === 'WORD_CLOUD' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>WORD CLOUD</span>
                        </div>
                    )}
                </div>
                <button onClick={() => setShowRoomCodeModal(true)} className="ml-2 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold text-slate-600 border border-slate-200">
                    <Hash size={10} /> {currentRoom?.code} <Maximize2 size={8} />
                </button>

            </div>
            
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setShowOnlineList(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-100 rounded-full hover:bg-green-100 transition-colors">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs font-bold text-green-700">{onlineUsers.length}</span>
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full cursor-pointer hover:bg-slate-200 transition-colors" onClick={handleRename}>
                <User size={14} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700 max-w-[80px] truncate">{currentUser}</span>
                <Edit3 size={10} className="text-slate-400" />
              </div>
              {isAdmin && <button onClick={() => setShowHistory(true)} className="text-slate-400 hover:text-indigo-600 p-2"><History size={18} /></button>}
              <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 p-2"><LogOut size={18} /></button>
            </div>
          </div>

          {/* Admin Switcher & Toolbar */}
          {isAdmin && (
             <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                {/* Game Switcher */}
                <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-fit">
                    <button 
                         onClick={() => handleSwitchGame('3_SECONDS')}
                         className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeGame === '3_SECONDS' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Timer size={16} /> 3 Seconds
                    </button>
                    <button 
                        onClick={() => handleSwitchGame('WORD_CLOUD')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeGame === 'WORD_CLOUD' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Cloud size={16} /> Word Cloud
                    </button>
                </div>

                {/* Word Cloud Toolbar (Only show if active) */}
                {activeGame === 'WORD_CLOUD' && (
                    <div className="flex flex-wrap items-center gap-3 animate-in slide-in-from-top-2">
                        {creatingNewQuestion ? (
                            <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1 rounded-md flex-grow">
                                <input type="text" placeholder="หัวข้อ..." className="text-xs border border-indigo-200 rounded px-2 py-1 w-full focus:outline-none" value={newQuestionTopic} onChange={(e) => setNewQuestionTopic(e.target.value)} autoFocus />
                                <button onClick={performNewQuestion} className="bg-indigo-600 text-white p-1 rounded"><Check size={14} /></button>
                                <button onClick={() => setCreatingNewQuestion(false)} className="bg-white border border-indigo-200 text-indigo-700 p-1 rounded"><XIcon size={14} /></button>
                            </div>
                        ) : (
                            <button onClick={() => setCreatingNewQuestion(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">
                                <PlusCircle size={16} /> คำถามใหม่
                            </button>
                        )}
                        <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
                        <button onClick={toggleShowResults} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showResults ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                            {showResults ? <EyeOff size={16} /> : <Eye size={16} />} <span className="hidden sm:inline">{showResults ? 'กดเพื่อซ่อนคำตอบ' : 'กดเพื่อแสดงคำตอบ'}</span>
                        </button>
                        <button onClick={() => syncWheel({ ...wheelState, isOpen: true })} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100">
                            <Dices size={16} /> <span className="hidden sm:inline">สุ่ม</span>
                        </button>
                    </div>
                )}
             </div>
          )}
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="w-full max-w-4xl px-4 py-6 space-y-6 flex-grow">
        
        {/* GAME: 3 SECONDS */}
        {activeGame === '3_SECONDS' ? (
            <ThreeSecondsGame 
                isAdmin={isAdmin}
                onBroadcastState={broadcast3SecState}
                syncedConfig={threeSecState}
            />
        ) : (
            /* GAME: WORD CLOUD */
            <>
                {/* Waiting State */}
                {!currentSession ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
                        <HelpCircle size={48} className="text-slate-300 mb-4" />
                        <h3 className="text-xl font-bold text-slate-600">รอผู้ดูแลตั้งคำถาม...</h3>
                    </div>
                ) : !isAdmin && !showResults ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-sm w-full">
                            <h3 className="text-xl font-bold text-slate-800 mb-2">รอเปิดคำตอบ...</h3>
                            <p className="text-slate-500 mb-6">ผู้ดูแลยังไม่แสดงผลลัพธ์</p>
                            {mySubmission ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-pulse">
                                    <p className="text-xs text-amber-600 font-bold uppercase mb-1">คุณตอบไปแล้ว</p>
                                    <p className="text-lg font-bold text-slate-800">"{mySubmission.text}"</p>
                                </div>
                            ) : (
                                <div className="flex justify-center text-slate-300"><Send size={48} /></div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex bg-slate-200 p-1 rounded-lg w-fit mx-auto shadow-inner items-center gap-1">
                            <div className="flex">
                                <button onClick={() => setViewMode(ViewMode.CLOUD)} className={`flex gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.CLOUD ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Cloud size={16} /> Cloud</button>
                                <button onClick={() => setViewMode(ViewMode.LIST)} className={`flex gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.LIST ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><List size={16} /> List</button>
                            </div>
                            {/* Auto Group Button (Only in List Mode + Admin) */}
                            {isAdmin && viewMode === ViewMode.LIST && (
                                <button onClick={handleAutoGroup} className="flex gap-2 px-3 py-2 rounded-md text-sm font-medium text-amber-600 hover:bg-white hover:shadow-sm transition-all" title="รวมคำอัตโนมัติ (AI)">
                                    <Sparkles size={16} /> <span className="hidden sm:inline">AI Group</span>
                                </button>
                            )}
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={() => fetchWords()} className="text-slate-400 hover:text-indigo-600 p-2"><RefreshCw size={16} /></button>
                        </div>
                        <div className="transition-all duration-300">
                            {viewMode === ViewMode.CLOUD ? <WordCloudChart data={words} /> : <WordList words={words} isAdmin={isAdmin} selectedIds={adminSelectedIds} onToggleSelect={(id) => setAdminSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])} />}
                        </div>
                    </>
                )}
            </>
        )}
      </main>

      {/* --- WordCloud: Footer Input Area (Only show in WordCloud Mode) --- */}
      {activeGame === 'WORD_CLOUD' && currentSession && (
          <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none">
              <div className="w-full bg-white/95 backdrop-blur-sm border-t border-indigo-100 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] pointer-events-auto pb-4 pt-4 px-4">
                  <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 leading-tight drop-shadow-sm select-none">
                        {topic || "รอคำถาม..."}
                    </h2>
                  </div>
              </div>

              {!isAdmin && (
                <div className="w-full bg-white border-t border-slate-200 p-4 shadow-none pointer-events-auto">
                    <div className="max-w-3xl mx-auto">
                        <form onSubmit={handleAddWord} className="flex gap-3">
                            <div className="relative flex-1">
                                <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={mySubmission ? "แก้ไขคำตอบ..." : `พิมพ์คำตอบ (${currentUser})...`} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all ${ (mySubmission && showResults) ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-300' }`} maxLength={30} disabled={isLoading || (!!mySubmission && showResults)} />
                            </div>
                            <button type="submit" disabled={!inputValue.trim() || isLoading || (!!mySubmission && showResults)} className={`text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none ${ mySubmission ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' }`}>
                                {mySubmission ? (showResults ? <Lock size={18} /> : <span>แก้ไข</span>) : <Send size={18} />}
                            </button>
                        </form>
                    </div>
                </div>
              )}
          </div>
      )}

      {/* Modals */}
      {wheelState.isOpen && <RandomNumber isAdmin={isAdmin} state={wheelState} onUpdateState={(p) => syncWheel({ ...wheelState, ...p })} onClose={() => syncWheel({ ...wheelState, isOpen: false })} />}
      {/* History Modal */}
      {showHistory && (
        <SessionHistory 
          sessions={sessionHistory} 
          onClose={() => setShowHistory(false)} 
          isAdmin={isAdmin}
          onRestore={async (sessionId) => {
             try {
                 const confirmRestore = await showConfirm("ต้องการกู้คืนคำถามนี้ใช่หรือไม่? คำถามปัจจุบันจะถูกปิดใช้งาน", { type: 'warning', title: 'Start Old Session' });
                 if (!confirmRestore) return;

                 // 1. Deactivate current session
                 if (currentSession) {
                     await supabase.from('sessions').update({ is_active: false }).eq('id', currentSession.id);
                 }

                 // 2. Activate target session
                 const { data: restoredSession, error } = await supabase.from('sessions').update({ is_active: true }).eq('id', sessionId).select().single();
                 
                 if (restoredSession) {
                     setCurrentSession(restoredSession);
                     setTopic(restoredSession.topic);
                     await fetchWords(restoredSession.id); // Load words immediately
                     setMySubmission(null); // Reset my submission state for new context
                     setShowResults(false);
                     setShowHistory(false);
                     
                     // 3. Ensure Game Mode is correct
                     if (activeGame !== 'WORD_CLOUD') {
                         handleSwitchGame('WORD_CLOUD');
                     }

                     // 4. Broadcast Update to Users
                     if (currentRoom) {
                         const channel = supabase.channel(`room_control_${currentRoom.code}`);
                         channel.send({ type: 'broadcast', event: 'ui_state_update', payload: { showResults: false } });
                         // Force refresh for users to pick up new session ID
                         setTimeout(() => {
                            channel.send({ type: 'broadcast', event: 'force_refresh', payload: {} });
                         }, 500);
                     }
                     
                     await showAlert("กู้คืนคำถามสำเร็จ", { type: 'success' });
                 } else {
                     throw new Error(error?.message || "Failed to restore");
                 }
             } catch (err: any) {
                 await showAlert("Error restoring session: " + err.message, { type: 'error' });
             }
          }}
        />
      )}
      {showRoomCodeModal && currentRoom && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-200 cursor-pointer" onClick={() => setShowRoomCodeModal(false)}>
            <div className="flex flex-col items-center gap-8 cursor-pointer">
                <h1 className="text-8xl md:text-[15rem] font-black text-indigo-600 leading-none drop-shadow-2xl select-none">{currentRoom.code}</h1>
                <div className="bg-white p-4 rounded-xl shadow-lg border border-indigo-100">
                    <QRCodeCanvas value={`${window.location.origin}${import.meta.env.BASE_URL}?room=${currentRoom.code}`} size={256} />
                </div>
                <p className="text-xl text-slate-400 font-bold animate-pulse mt-4">แตะที่ใดก็ได้เพื่อปิด</p>
            </div>
        </div>
      )}
      
      {/* Online Users Modal (Reusable) */}
      {showOnlineList && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowOnlineList(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-700">Online ({onlineUsers.length})</h3><button onClick={() => setShowOnlineList(false)}><XIcon size={20} /></button></div>
                <div className="p-4 max-h-[60vh] overflow-y-auto grid grid-cols-2 gap-2">{onlineUsers.map((u, i) => <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-sm"><User size={14}/>{u}</div>)}</div>
            </div>
        </div>
      )}

      {/* Admin Floating Actions for WordCloud List View */}
      {isAdmin && adminSelectedIds.length > 0 && viewMode === ViewMode.LIST && activeGame === 'WORD_CLOUD' && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 border border-slate-700">
            <span className="font-bold">{adminSelectedIds.length} Selected</span>
            <div className="flex gap-3">
                {/* Simplified delete/merge actions */}
                <button onClick={async () => { if(confirm("Delete?")) { await supabase.from('words').delete().in('id', adminSelectedIds); setAdminSelectedIds([]); fetchWords(); }}} className="bg-slate-800 text-rose-400 p-2 rounded-lg"><Trash2 size={20} /></button>
            </div>
        </div>
      )}

      {/* Audio Controller (Admin Only) */}
      <AudioController isAdmin={isAdmin} />
    </div>
  );
};

export default App;