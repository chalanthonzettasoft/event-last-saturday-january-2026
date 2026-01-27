import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, WordEntry, WheelState, DBSession, DBRoom, Session } from './types';
import WordCloudChart from './components/WordCloudChart';
import WordList from './components/WordList';
import LoginScreen from './components/LoginScreen';
import RandomWheel from './components/RandomWheel';
import SessionHistory from './components/SessionHistory';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { groupWordsWithLocalAI, WordGroup, isModelReady } from './services/localGroupingService';
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
  Merge as MergeIcon,
  Edit3,
  Lock,
  RefreshCw,
  Maximize2,
  Users,
  Trash2,
  Sparkles,
  Loader2
} from 'lucide-react';

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true); // Loading state for auto-login
  
  // New Structure: Room (Persistent) vs Session (Ephemeral Question)
  const [currentRoom, setCurrentRoom] = useState<DBRoom | null>(null);
  const [currentSession, setCurrentSession] = useState<DBSession | null>(null);
  
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
  const [isAiProcessing, setIsAiProcessing] = useState(false); // AI Loading
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
          // 1. Fetch Room
          const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', storedRoomCode)
            .eq('is_active', true)
            .single();

          if (room && !roomError) {
             // 2. Fetch Active Session
             const { data: session } = await supabase
               .from('sessions')
               .select('*')
               .eq('room_id', room.id)
               .eq('is_active', true)
               .order('created_at', { ascending: false })
               .limit(1)
               .single();
             
             // Restore State
             setCurrentUser(storedUser);
             setIsAdmin(storedIsAdmin);
             setCurrentRoom(room);
             setCurrentSession(session || null);
             if (session) {
                setTopic(session.topic);
             }
          }
        } catch (e) {
          console.error("Auto-login failed:", e);
          localStorage.removeItem('cloudmind_room_code');
        }
      }
      setIsRestoringSession(false);
    };

    restoreSession();
  }, []);

  // --- Helpers ---
  
  // Fetch Words for the Current Session
  const fetchWords = useCallback(async (targetSessionId?: string) => {
    const sessionIdToFetch = targetSessionId || currentSession?.id;
    if (!sessionIdToFetch || !isSupabaseConfigured()) return;

    // Fetch data specifically for this session
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('session_id', sessionIdToFetch);

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

  // 1. Listen for SESSION changes + PRESENCE (Online Users)
  useEffect(() => {
    if (!currentRoom || !isSupabaseConfigured() || !currentUser) return;

    // Listen to changes in 'sessions' table where room_id matches
    const roomChannel = supabase
      .channel(`room_main_${currentRoom.id}`)
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
            if (newSession.is_active) {
                console.log("New Session Detected!", newSession);
                setCurrentSession(newSession);
                setTopic(newSession.topic);
                setWords([]);
                setMySubmission(null);
                setShowResults(false);
                setInputValue('');
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
              const updatedSession = payload.new as DBSession;
              
              if (currentSession && updatedSession.id === currentSession.id) {
                  // Current session updates (topic change, deactivation)
                  if (updatedSession.topic !== topic) {
                      setTopic(updatedSession.topic);
                  }
              } else if (updatedSession.is_active === true) {
                 // A different session became active (Restore happened)
                 // We need to switch to it
                 setCurrentSession(updatedSession);
                 setTopic(updatedSession.topic);
                 // We don't clear words immediately if we are the admin who restored it, 
                 // as we might have pre-fetched. But for others, clear/fetch.
                 // Ideally fetchWords will run due to currentSession dependency change.
              }
          }
      )
      // --- PRESENCE LOGIC ---
      .on('presence', { event: 'sync' }, () => {
         const newState = roomChannel.presenceState();
         const users = Object.values(newState).flat().map((u: any) => u.user);
         const uniqueUsers = Array.from(new Set(users));
         setOnlineUsers(uniqueUsers);
      })
      .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             await roomChannel.track({ 
                 user: currentUser, 
                 online_at: new Date().toISOString() 
             });
          }
      });

    return () => {
        supabase.removeChannel(roomChannel);
    };
  }, [currentRoom, currentSession, topic, currentUser]);


  // 2. Listen for WORD changes within the current SESSION + POLLING BACKUP
  useEffect(() => {
    if (!currentSession || !isSupabaseConfigured()) return;

    // Initial load for this session
    fetchWords(currentSession.id);
    setTopic(currentSession.topic);

    // Subscribe to ALL word changes
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
             fetchWords(currentSession.id);
        }
      )
      .subscribe();

    // --- POLLING BACKUP ---
    const intervalId = setInterval(() => {
      fetchWords(currentSession.id);
    }, 3000);

    return () => {
      supabase.removeChannel(wordChannel);
      clearInterval(intervalId);
    };
  }, [currentSession, fetchWords]); // fetchWords is memoized

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
    localStorage.setItem('cloudmind_room_code', roomData.code);
    localStorage.setItem('cloudmind_is_admin', String(adminMode));

    setCurrentUser(nickname);
    setIsAdmin(adminMode);
    setCurrentRoom(roomData);
    setCurrentSession(initialSession); 
    if (initialSession) {
        setTopic(initialSession.topic);
    } else {
        setTopic("รอคำถามจาก Admin...");
    }
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

  const executeBatchMerge = async (groups: WordGroup[]) => {
      if (!currentSession) return;
      
      try {
        for (const group of groups) {
            // Find words to merge
            const targetWords = words.filter(w => group.idsToMerge.includes(w.id));
            if (targetWords.length === 0) continue;

            // Calculate totals
            const totalCount = targetWords.reduce((acc, curr) => acc + curr.count, 0);
            const allSubmitters = targetWords.flatMap(w => w.submittedBy);
            const newId = generateId();
            const newNormalized = normalizeForGrouping(group.masterText);

            // Insert merged
            const { error: insertError } = await supabase.from('words').insert({
                id: newId,
                session_id: currentSession.id,
                text: group.masterText,
                normalized_text: newNormalized,
                count: totalCount,
                submitted_by: allSubmitters
            });

            if (insertError) {
                console.error("AI Merge Insert Error", insertError);
                continue; // Skip if dup or error
            }

            // Delete old
            await supabase.from('words').delete().in('id', group.idsToMerge);
        }
        // Refresh after batch
        fetchWords();
      } catch (e) {
        console.error("Batch Merge Error", e);
      }
  };

  const toggleShowResults = async () => {
    // If we are showing results (going from False -> True) AND we are Admin
    if (!showResults && isAdmin) {
        // Ask if user wants AI grouping
        const wantAI = window.confirm("ต้องการให้ AI ช่วยรวมคำตอบที่เหมือนกันให้หรือไม่?\n(เช่น 'ดีมาก' กับ 'ดีสุดๆ')");
        
        if (wantAI) {
            setIsAiProcessing(true);
            try {
                // 1. Fetch latest words just to be sure
                const { data: latestData } = await supabase
                    .from('words')
                    .select('*')
                    .eq('session_id', currentSession?.id);
                
                if (latestData) {
                    const currentWords = latestData.map((item: any) => ({
                        id: item.id,
                        text: item.text,
                        normalizedText: item.normalized_text || '',
                        count: item.count,
                        submittedBy: item.submitted_by || [],
                        sessionId: item.session_id || ''
                    })) as WordEntry[];

                    // 2. Call Local AI
                    if (!isModelReady()) {
                        alert("กำลังโหลด AI Model... (ครั้งแรกอาจใช้เวลาสักครู่)");
                    }
                    const groups = await groupWordsWithLocalAI(topic, currentWords, 0.7);
                    
                    // 3. Execute Merges
                    if (groups.length > 0) {
                        await executeBatchMerge(groups);
                        alert(`รวมคำสำเร็จ ${groups.length} กลุ่ม`);
                    } else {
                        alert("AI ไม่พบคำที่ต้องรวมกันเพิ่ม");
                    }
                }
            } catch (err: any) {
                alert("AI Error: " + err.message);
            } finally {
                setIsAiProcessing(false);
            }
        }
    }

    // Toggle State
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

  const handleRestoreSession = async (sessionId: string) => {
      if (!currentRoom || !isAdmin) return;
      
      const confirmRestore = window.confirm("ต้องการนำคำถามเก่ากลับมาใช้ใหม่หรือไม่?\n(คำถามปัจจุบันจะถูกปิด)");
      if (!confirmRestore) return;
      
      // Close modal immediately so user sees something happening
      setShowHistory(false);
      setIsLoading(true);

      try {
          // 1. Deactivate others first to prevent multiple actives
          await supabase
            .from('sessions')
            .update({ is_active: false })
            .eq('room_id', currentRoom.id)
            .neq('id', sessionId);
            
          // 2. Activate Target
          const { data: restoredSession, error } = await supabase
            .from('sessions')
            .update({ is_active: true })
            .eq('id', sessionId)
            .select()
            .single();

          if (error) throw error;
          
          // 3. Update Local State Immediately (Don't wait for Realtime)
          // This fixes the "nothing happens" feeling
          setCurrentSession(restoredSession);
          setTopic(restoredSession.topic);
          setShowResults(true); // Usually we want to show results for history
          setWords([]); // Clear briefly
          setMySubmission(null);
          
          // 4. Force fetch data for this session immediately
          await fetchWords(sessionId);

          // 5. Broadcast UI state to others
          supabase.channel(`room_control_${currentRoom.code}`).send({
            type: 'broadcast',
            event: 'ui_state_update',
            payload: { showResults: true }
          });
          
      } catch (err: any) {
          alert("กู้คืนไม่สำเร็จ: " + err.message);
          setShowHistory(true); // Re-open if failed
      } finally {
          setIsLoading(false);
      }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !currentUser || !currentSession || !currentRoom) return;
    if (!isSupabaseConfigured()) {
        alert("กรุณาเชื่อมต่อ Supabase");
        return;
    }

    if (mySubmission && showResults) {
      alert("หมดเวลาแก้ไขคำตอบแล้ว");
      return;
    }

    setIsLoading(true);
    const rawText = inputValue.trim();
    const normalizedKey = normalizeForGrouping(rawText);

    try {
        if (mySubmission) {
           if (normalizeForGrouping(mySubmission.text) === normalizedKey) {
              setInputValue('');
              setIsLoading(false);
              return;
           }
           const newSubmitters = mySubmission.submittedBy.filter(u => u !== currentUser);
           const newCount = Math.max(0, mySubmission.count - 1);
           if (newCount === 0) {
              const { error: delError } = await supabase
                .from('words')
                .delete()
                .eq('id', mySubmission.id);
              if (delError) throw delError;
           } else {
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
        // Deactivate old session first
        if (currentSession) {
            await supabase.from('sessions').update({ is_active: false }).eq('id', currentSession.id);
        }

        const { data: newSession, error } = await supabase
          .from('sessions')
          .insert({
            room_id: currentRoom.id,
            room_code: currentRoom.code, 
            topic: newQuestionTopic.trim(),
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // Current user (admin) updates immediately
        setCurrentSession(newSession);
        setTopic(newQuestionTopic.trim());
        setWords([]);
        setMySubmission(null);
        setShowResults(false);
        setInputValue('');
        
        if (currentRoom) {
          supabase.channel(`room_control_${currentRoom.code}`).send({
            type: 'broadcast',
            event: 'ui_state_update',
            payload: { showResults: false }
          });
        }

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

  const initiateMerge = async () => {
    if (adminSelectedIds.length < 2) {
         alert("กรุณาเลือกอย่างน้อย 2 คำเพื่อทำการรวม");
         return;
    }
    if (!currentSession) {
         alert("ข้อผิดพลาด: ไม่พบ Session ปัจจุบัน (กรุณา Refresh หน้าจอ)");
         return;
    }
    setIsLoading(true);
    try {
        const { data: freshWords, error: fetchError } = await supabase
            .from('words')
            .select('*')
            .in('id', adminSelectedIds);
        if (fetchError) throw new Error(fetchError.message);
        if (!freshWords || freshWords.length < 2) {
            alert("ไม่พบคำที่เลือก หรือคำอาจถูกลบไปแล้ว");
            setAdminSelectedIds([]);
            fetchWords();
            setIsLoading(false);
            return;
        }
        const sortedFresh = freshWords.sort((a: any, b: any) => b.count - a.count);
        const combinedText = sortedFresh.map((w: any) => w.text).join(" + ");
        const totalCount = freshWords.reduce((sum: number, w: any) => sum + w.count, 0);
        const allSubmitters = freshWords.flatMap((w: any) => w.submitted_by || []);

        setMergeModalData({
            items: sortedFresh,
            combinedText,
            totalCount,
            allSubmitters
        });
        setIsLoading(false);
    } catch (err: any) {
        alert("เกิดข้อผิดพลาด: " + err.message);
        setIsLoading(false);
    }
  };

  const executeMerge = async () => {
    if (!mergeModalData || !currentSession) return;
    setIsLoading(true);
    try {
        const { items, combinedText, totalCount, allSubmitters } = mergeModalData;
        const idsToDelete = items.map(i => i.id);
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
            if (insertError.code === '23505') { 
                 alert("มีชื่อซ้ำ");
            } else {
                 throw insertError;
            }
            setIsLoading(false);
            return; 
        }

        const { error: delError } = await supabase
            .from('words')
            .delete()
            .in('id', idsToDelete);
        
        if (delError) console.error(delError);

        setMergeModalData(null);
        setAdminSelectedIds([]);
        fetchWords();
    } catch (err: any) {
        alert("รวมคำไม่สำเร็จ: " + err.message);
    } finally {
        setIsLoading(false);
    }
  };
  
  const deleteSelectedWords = async () => {
    if (adminSelectedIds.length === 0) return;
    if (!currentSession) return;
    if (!window.confirm(`ลบ ${adminSelectedIds.length} รายการ?`)) return;
    
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
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // --- Render ---

  if (isRestoringSession) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!isSupabaseConfigured()) {
     return <div className="p-10 text-center">Please configure Supabase API Key</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-48 md:pb-52 relative">
      
      {/* AI Loading Overlay */}
      {isAiProcessing && (
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white animate-in fade-in">
              <Sparkles className="w-16 h-16 text-amber-400 animate-pulse mb-4" />
              <h2 className="text-2xl font-bold mb-2">AI กำลังวิเคราะห์...</h2>
              <p className="text-slate-300">กำลังจัดกลุ่มคำตอบที่มีความหมายเหมือนกัน</p>
          </div>
      )}
      
      {/* Loading Overlay (General) */}
      {isLoading && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none">
           <div className="bg-black/50 p-4 rounded-xl backdrop-blur-sm flex flex-col items-center text-white animate-in fade-in">
               <Loader2 className="animate-spin mb-2" size={32} />
               <span className="text-sm font-medium">กำลังโหลด...</span>
           </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white ${isAdmin ? 'bg-rose-600' : 'bg-indigo-600'}`}>
                  {isAdmin ? <Settings size={14} /> : <BarChart3 size={14} />}
                </div>
                <h1 className="font-bold text-slate-800 tracking-tight text-sm md:text-lg truncate max-w-[200px] md:max-w-md">WordCloud</h1>
                
                {/* Room Code with Expand Action */}
                <button 
                  onClick={() => setShowRoomCodeModal(true)}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 transition-colors px-2 py-0.5 rounded text-xs font-mono font-bold text-slate-600 border border-slate-200 cursor-pointer"
                  title="คลิกเพื่อขยายเลขห้อง"
                >
                   <Hash size={10} /> {currentRoom?.code} <Maximize2 size={8} />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-end">
              {/* Online Users Count */}
              <button 
                onClick={() => setShowOnlineList(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-100 rounded-full mr-1 hover:bg-green-100 transition-colors cursor-pointer"
                title="ดูรายชื่อคนออนไลน์"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs font-bold text-green-700">{onlineUsers.length} Online</span>
              </button>

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
                  onClick={initiateMerge}
                  disabled={adminSelectedIds.length < 2 || isLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/50"
                >
                    <MergeIcon size={20} />
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

      {/* --- Footer Area: Topic & Input --- */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none">
          
          {/* LARGE TOPIC DISPLAY */}
          {currentSession && (
              <div className="w-full bg-white/95 backdrop-blur-sm border-t border-indigo-100 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] pointer-events-auto pb-4 pt-4 px-4">
                  <div className="max-w-4xl mx-auto text-center">
                    <h2 
                        className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 leading-tight drop-shadow-sm select-none"
                    >
                        {topic || "รอคำถาม..."}
                    </h2>
                  </div>
              </div>
          )}

          {/* USER INPUT BAR */}
          {currentSession && !isAdmin && (
            <div className="w-full bg-white border-t border-slate-200 p-4 shadow-none pointer-events-auto">
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
      </div>

      {wheelState.isOpen && (
        <RandomWheel 
          isAdmin={isAdmin} 
          state={wheelState} 
          onUpdateState={(p) => syncWheel({ ...wheelState, ...p })}
          onClose={() => syncWheel({ ...wheelState, isOpen: false })} 
        />
      )}

      {showHistory && (
        <SessionHistory 
            sessions={sessionHistory} 
            onClose={() => setShowHistory(false)} 
            isAdmin={isAdmin}
            onRestore={handleRestoreSession}
        />
      )}
      
      {/* --- Custom Merge Confirmation Modal --- */}
      {mergeModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-full">
                        <MergeIcon size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">ยืนยันการรวมคำ</h3>
                        <p className="text-slate-500 text-sm">รายการที่เลือกจะถูกรวมเป็นคำตอบเดียว</p>
                    </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 max-h-[200px] overflow-y-auto">
                    <div className="space-y-2 mb-4">
                        {mergeModalData.items.map((item: any) => (
                            <div key={item.id} className="flex justify-between text-sm text-slate-500">
                                 <span>- {item.text}</span>
                                 <span className="font-mono">({item.count})</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">รวมเป็น:</span>
                        <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                             {mergeModalData.combinedText}
                             <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                                {mergeModalData.totalCount}
                             </span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => setMergeModalData(null)}
                        className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                        disabled={isLoading}
                    >
                        ยกเลิก
                    </button>
                    <button 
                        onClick={executeMerge}
                        disabled={isLoading}
                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 flex justify-center items-center gap-2"
                    >
                        {isLoading ? <RefreshCw className="animate-spin" size={20}/> : 'ยืนยันรวมคำ'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- BIG ROOM CODE MODAL --- */}
      {showRoomCodeModal && currentRoom && (
          <div 
             className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-200"
             onClick={() => setShowRoomCodeModal(false)}
          >
             <button className="absolute top-8 right-8 bg-slate-100 p-4 rounded-full text-slate-500 hover:bg-slate-200">
                <XIcon size={32} />
             </button>
             
             <p className="text-2xl text-slate-500 mb-4 font-bold uppercase tracking-widest">Room Code</p>
             <h1 className="text-[12rem] md:text-[20rem] font-black text-indigo-600 leading-none tracking-tighter drop-shadow-xl select-all">
                {currentRoom.code}
             </h1>
             <p className="mt-8 text-xl text-slate-400">คลิกที่ไหนก็ได้เพื่อปิด</p>
          </div>
      )}

      {/* --- ONLINE USERS LIST MODAL --- */}
      {showOnlineList && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setShowOnlineList(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        ผู้ที่กำลังออนไลน์ ({onlineUsers.length})
                    </h3>
                    <button onClick={() => setShowOnlineList(false)} className="text-slate-400 hover:text-slate-600">
                        <XIcon size={20} />
                    </button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {onlineUsers.length === 0 ? (
                        <p className="text-center text-slate-400 py-4">ไม่มีผู้ใช้งานอื่น</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {onlineUsers.map((user, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
                                    <User size={14} className="text-indigo-400" />
                                    <span className="truncate">{user}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;