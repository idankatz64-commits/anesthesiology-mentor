import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { KEYS } from '@/lib/types';
import { generateRoomCode, pickQuestionsForRoom } from '@/lib/studyRoomUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Users, ChevronDown, MessageCircle, Crown, Clock } from 'lucide-react';
import { toast } from 'sonner';

type Phase = 'lobby' | 'waiting' | 'question' | 'results';
type Participant = { id: string; user_id: string; display_name: string; is_ready: boolean; last_active_at: string };
type RoomAnswer = { user_id: string; selected_answer: string; is_correct: boolean; question_index: number };

export default function StudyRoomView() {
  const { data, navigate, updateHistory, syncAnswerToDb } = useApp();

  const [phase, setPhase] = useState<Phase>('lobby');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<RoomAnswer[]>([]);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [allAnswered, setAllAnswered] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<number | null>(null);

  // Lobby state
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set(['all']));
  const [questionCount, setQuestionCount] = useState(10);
  const [randomMix, setRandomMix] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topics = useMemo(() => [...new Set(data.map(q => q[KEYS.TOPIC]).filter(Boolean))].sort(), [data]);

  const currentQuestion = useMemo(() => {
    if (!questionIds.length) return null;
    const qId = questionIds[currentIndex];
    return data.find(q => q[KEYS.ID] === qId) || null;
  }, [data, questionIds, currentIndex]);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // =================== LOBBY ===================
  const toggleTopic = (val: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (val === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(val)) next.delete(val);
      else next.add(val);
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  };

  const handleCreateRoom = async () => {
    if (!userId) { toast.error('יש להתחבר קודם'); return; }
    setLoading(true);
    try {
      const code = generateRoomCode();
      const ids = pickQuestionsForRoom(data, selectedTopics, questionCount, randomMix);
      if (ids.length === 0) { toast.error('לא נמצאו שאלות'); setLoading(false); return; }

      const { data: room, error } = await supabase.from('study_rooms').insert({
        room_code: code,
        created_by: userId,
        question_ids: ids,
        status: 'waiting',
      } as any).select().single();

      if (error) throw error;

      await supabase.from('room_participants').insert({
        room_id: (room as any).id,
        user_id: userId,
        display_name: 'מארגן',
        is_ready: false,
      } as any);

      setRoomId((room as any).id);
      setRoomCode(code);
      setQuestionIds(ids);
      setIsCreator(true);
      setPhase('waiting');
      startWaitingPoll((room as any).id);
    } catch (e: any) {
      toast.error(e.message || 'שגיאה ביצירת חדר');
    }
    setLoading(false);
  };

  const handleJoinRoom = async () => {
    if (!userId) { toast.error('יש להתחבר קודם'); return; }
    if (joinCode.length !== 6) { toast.error('קוד חייב להכיל 6 תווים'); return; }
    setLoading(true);
    try {
      const { data: rooms, error } = await supabase.from('study_rooms')
        .select('*')
        .eq('room_code', joinCode.toUpperCase())
        .eq('status', 'waiting') as any;

      if (error) throw error;
      if (!rooms || rooms.length === 0) { toast.error('חדר לא נמצא או שכבר התחיל'); setLoading(false); return; }

      const room = rooms[0];
      await supabase.from('room_participants').insert({
        room_id: room.id,
        user_id: userId,
        display_name: 'משתתף',
        is_ready: false,
      } as any);

      setRoomId(room.id);
      setRoomCode(room.room_code);
      setQuestionIds(room.question_ids);
      setIsCreator(false);
      setPhase('waiting');
      startWaitingPoll(room.id);
    } catch (e: any) {
      toast.error(e.message || 'שגיאה בהצטרפות');
    }
    setLoading(false);
  };

  // =================== WAITING ===================
  const startWaitingPoll = (rId: string) => {
    stopPolling();
    const poll = async () => {
      const { data: parts } = await supabase.from('room_participants')
        .select('*').eq('room_id', rId) as any;
      if (parts) setParticipants(parts);

      const { data: room } = await supabase.from('study_rooms')
        .select('*').eq('id', rId).single() as any;
      if (room && room.status === 'active') {
        stopPolling();
        setCurrentIndex(room.current_question_index);
        setPhase('question');
        startQuestionPoll(rId);
      }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
  };

  const handleToggleReady = async () => {
    if (!roomId || !userId) return;
    const me = participants.find(p => p.user_id === userId);
    if (!me) return;
    await supabase.from('room_participants')
      .update({ is_ready: !me.is_ready, last_active_at: new Date().toISOString() } as any)
      .eq('id', me.id);
  };

  const handleStartExam = async () => {
    if (!roomId) return;
    await supabase.from('study_rooms')
      .update({ status: 'active' } as any)
      .eq('id', roomId);
  };

  const allReady = participants.length >= 2 && participants.every(p => p.is_ready);

  // =================== QUESTION ===================
  const startQuestionPoll = (rId: string) => {
    stopPolling();
    const poll = async () => {
      // Fetch room state
      const { data: room } = await supabase.from('study_rooms')
        .select('*').eq('id', rId).single() as any;
      if (room) {
        if (room.status === 'finished') {
          stopPolling();
          setPhase('results');
          return;
        }
        setCurrentIndex(room.current_question_index);
      }

      // Fetch all answers for current index
      const { data: ans } = await supabase.from('room_answers')
        .select('*').eq('room_id', rId) as any;
      if (ans) setAnswers(ans);

      // Fetch participants
      const { data: parts } = await supabase.from('room_participants')
        .select('*').eq('room_id', rId) as any;
      if (parts) setParticipants(parts);
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
  };

  // Check if all answered current question
  useEffect(() => {
    if (phase !== 'question') return;
    const currentAnswers = answers.filter(a => a.question_index === currentIndex);
    const allDone = participants.length >= 2 && currentAnswers.length >= participants.length;
    setAllAnswered(allDone);

    // Auto-advance timer
    if (allDone && !isCreator) {
      const timer = window.setTimeout(() => {
        // Will be advanced by polling when creator advances
      }, 10000);
      setAutoAdvanceTimer(timer as any);
      return () => clearTimeout(timer);
    }
  }, [answers, participants, currentIndex, phase, isCreator]);

  const handleSelectAnswer = async (answer: string) => {
    if (myAnswer || !currentQuestion || !roomId || !userId) return;
    setMyAnswer(answer);

    const isCorrect = answer === currentQuestion[KEYS.CORRECT];

    // Save to room_answers
    await supabase.from('room_answers').insert({
      room_id: roomId,
      question_index: currentIndex,
      user_id: userId,
      selected_answer: answer,
      is_correct: isCorrect,
    } as any);

    // Save to personal stats
    updateHistory(currentQuestion[KEYS.ID], isCorrect);
    syncAnswerToDb(currentQuestion[KEYS.ID], isCorrect, currentQuestion[KEYS.TOPIC]);

    // Update last_active_at
    const me = participants.find(p => p.user_id === userId);
    if (me) {
      await supabase.from('room_participants')
        .update({ last_active_at: new Date().toISOString() } as any)
        .eq('id', me.id);
    }
  };

  const handleNextQuestion = async () => {
    if (!roomId) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx >= questionIds.length) {
      await supabase.from('study_rooms')
        .update({ status: 'finished', current_question_index: nextIdx } as any)
        .eq('id', roomId);
    } else {
      await supabase.from('study_rooms')
        .update({ current_question_index: nextIdx } as any)
        .eq('id', roomId);
      setMyAnswer(null);
      setAllAnswered(false);
    }
  };

  // Reset myAnswer when index changes
  useEffect(() => {
    const myAns = answers.find(a => a.question_index === currentIndex && a.user_id === userId);
    setMyAnswer(myAns ? myAns.selected_answer : null);
  }, [currentIndex, answers, userId]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`בוא נתרגל ביחד! קוד חדר: ${roomCode}`)}`;

  // =================== RESULTS ===================
  const myScore = useMemo(() => answers.filter(a => a.user_id === userId && a.is_correct).length, [answers, userId]);
  const otherParticipants = useMemo(() => participants.filter(p => p.user_id !== userId), [participants, userId]);

  // =================== RENDER ===================

  if (phase === 'lobby') {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">תרגול משותף 👥</h1>
          <p className="text-muted-foreground">למדו ביחד עם חברים בזמן אמת</p>
        </div>

        {/* Create Room */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground">צור חדר חדש</h2>

          {/* Topic selector */}
          <div className="relative">
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">נושאים</label>
            <button
              onClick={() => setTopicDropdownOpen(!topicDropdownOpen)}
              className="w-full p-4 bg-background border border-border rounded-2xl text-right text-foreground text-sm font-medium flex justify-between items-center"
            >
              <span>{selectedTopics.has('all') ? 'כל הנושאים' : `${selectedTopics.size} נבחרו`}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {topicDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTopicDropdownOpen(false)} />
                <div className="absolute z-20 w-full bg-card border border-border shadow-xl rounded-2xl mt-2 max-h-60 overflow-y-auto p-2">
                  <div onClick={() => { toggleTopic('all'); }} className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition ${selectedTopics.has('all') ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'}`}>
                    {selectedTopics.has('all') ? '☑' : '☐'} הכל
                  </div>
                  {topics.map(t => (
                    <div key={t} onClick={() => toggleTopic(t)} className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition ${selectedTopics.has(t) ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'}`}>
                      {selectedTopics.has(t) ? '☑' : '☐'} {t}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Question count */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">מספר שאלות</label>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${questionCount === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Random mix */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={randomMix} onChange={() => setRandomMix(!randomMix)} className="w-4 h-4 accent-primary" />
            <span className="text-sm text-foreground">ערבוב אקראי</span>
          </label>

          <Button onClick={handleCreateRoom} disabled={loading} className="w-full text-base py-6">
            {loading ? '...יוצר' : 'צור חדר והזמן חבר'}
          </Button>
        </div>

        {/* Join Room */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground">הצטרף לחדר קיים</h2>
          <Input
            placeholder="הזן קוד חדר (6 תווים)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            className="text-center text-2xl tracking-[0.3em] font-mono"
            maxLength={6}
          />
          <Button onClick={handleJoinRoom} disabled={loading || joinCode.length !== 6} variant="outline" className="w-full text-base py-6">
            {loading ? '...מצטרף' : 'הצטרף'}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="max-w-lg mx-auto space-y-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">חדר המתנה</h1>

        {/* Room code */}
        <div className="bg-card border border-border rounded-2xl p-8">
          <p className="text-xs text-muted-foreground uppercase mb-2">קוד חדר</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-mono font-bold tracking-[0.4em] text-primary">{roomCode}</span>
            <button onClick={copyCode} className="p-2 rounded-lg hover:bg-muted transition">
              {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
            </button>
          </div>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-sm text-green-600 hover:text-green-700 font-medium">
            <MessageCircle className="w-4 h-4" /> שלח בוואטסאפ
          </a>
        </div>

        {/* Participants */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-bold text-muted-foreground mb-4">משתתפים ({participants.length})</h3>
          <div className="space-y-3">
            {participants.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-2">
                  {p.user_id === userId && <Crown className="w-4 h-4 text-primary" />}
                  <span className="text-sm font-medium text-foreground">{p.display_name}</span>
                </div>
                {p.is_ready ? (
                  <span className="text-xs bg-green-500/20 text-green-600 px-3 py-1 rounded-full font-bold">מוכן ✓</span>
                ) : (
                  <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">ממתין...</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Ready / Start buttons */}
        <div className="space-y-3">
          <Button onClick={handleToggleReady} variant={participants.find(p => p.user_id === userId)?.is_ready ? 'secondary' : 'default'} className="w-full py-6 text-base">
            {participants.find(p => p.user_id === userId)?.is_ready ? 'ביטול מוכנות' : '!מוכן'}
          </Button>
          {isCreator && allReady && (
            <Button onClick={handleStartExam} className="w-full py-6 text-base bg-green-600 hover:bg-green-700">
              התחל מבחן 🚀
            </Button>
          )}
          {isCreator && !allReady && participants.length >= 2 && (
            <p className="text-sm text-muted-foreground">ממתין שכולם יהיו מוכנים...</p>
          )}
          {participants.length < 2 && (
            <p className="text-sm text-muted-foreground">ממתין למשתתפים נוספים...</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'question' && currentQuestion) {
    const currentAnswersForQ = answers.filter(a => a.question_index === currentIndex);
    const answerLabels = ['A', 'B', 'C', 'D'] as const;
    const answerKeys = [KEYS.A, KEYS.B, KEYS.C, KEYS.D] as const;

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-primary">{currentIndex + 1}/{questionIds.length}</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">{roomCode}</span>
          </div>
          <div className="flex items-center gap-2">
            {participants.map(p => {
              const hasAnswered = currentAnswersForQ.some(a => a.user_id === p.user_id);
              return (
                <div key={p.id} className={`w-3 h-3 rounded-full transition ${hasAnswered ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                  title={p.display_name} />
              );
            })}
          </div>
        </div>

        {/* Question */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <p className="text-lg font-medium text-foreground leading-relaxed whitespace-pre-wrap">
            {currentQuestion[KEYS.QUESTION]}
          </p>
        </div>

        {/* Answer options */}
        <div className="space-y-3">
          {answerLabels.map((label, i) => {
            const text = currentQuestion[answerKeys[i]];
            if (!text) return null;
            const isSelected = myAnswer === label;
            const correct = currentQuestion[KEYS.CORRECT];
            const showResult = allAnswered;
            const isCorrectAnswer = label === correct;

            let cls = 'bg-card border border-border text-foreground hover:border-primary/50';
            if (isSelected && !showResult) cls = 'bg-primary/20 border-primary text-foreground';
            if (showResult && isCorrectAnswer) cls = 'bg-green-500/20 border-green-500 text-foreground';
            if (showResult && isSelected && !isCorrectAnswer) cls = 'bg-red-500/20 border-red-500 text-foreground';

            return (
              <button
                key={label}
                onClick={() => handleSelectAnswer(label)}
                disabled={!!myAnswer}
                className={`w-full p-4 rounded-2xl text-right transition flex items-start gap-3 ${cls} ${myAnswer ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm font-bold shrink-0">{label}</span>
                <span className="text-sm">{text}</span>
              </button>
            );
          })}
        </div>

        {/* Waiting / Results */}
        {myAnswer && !allAnswered && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 animate-pulse" />
              <span className="text-sm">ממתין לשאר המשתתפים...</span>
            </div>
          </motion.div>
        )}

        {allAnswered && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Per-participant results */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              {participants.map(p => {
                const ans = currentAnswersForQ.find(a => a.user_id === p.user_id);
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{p.display_name}</span>
                    <span className={ans?.is_correct ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                      {ans?.selected_answer} {ans?.is_correct ? '✅' : '❌'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Explanation */}
            {currentQuestion[KEYS.EXPLANATION] && (
              <div className="bg-muted/50 border border-border rounded-2xl p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">הסבר</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{currentQuestion[KEYS.EXPLANATION]}</p>
              </div>
            )}

            {/* Next button */}
            {isCreator && (
              <Button onClick={handleNextQuestion} className="w-full py-6 text-base">
                {currentIndex + 1 >= questionIds.length ? 'סיום 🏁' : 'הבא ←'}
              </Button>
            )}
            {!isCreator && (
              <p className="text-sm text-center text-muted-foreground">ממתין שהמארגן יתקדם...</p>
            )}
          </motion.div>
        )}
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">תוצאות 🏆</h1>
          <p className="text-muted-foreground">סיכום מבחן משותף</p>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">אתה</p>
            <p className="text-4xl font-bold text-primary">{myScore}/{questionIds.length}</p>
          </div>
          {otherParticipants.map(p => {
            const score = answers.filter(a => a.user_id === p.user_id && a.is_correct).length;
            return (
              <div key={p.id} className="bg-card border border-border rounded-2xl p-6 text-center">
                <p className="text-xs text-muted-foreground mb-1">{p.display_name}</p>
                <p className="text-4xl font-bold text-foreground">{score}/{questionIds.length}</p>
              </div>
            );
          })}
        </div>

        {/* Per-question breakdown */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right text-muted-foreground">#</th>
                <th className="p-3 text-right text-muted-foreground">אתה</th>
                {otherParticipants.map(p => (
                  <th key={p.id} className="p-3 text-right text-muted-foreground">{p.display_name}</th>
                ))}
                <th className="p-3 text-right text-muted-foreground">תשובה</th>
              </tr>
            </thead>
            <tbody>
              {questionIds.map((qId, idx) => {
                const q = data.find(d => d[KEYS.ID] === qId);
                const myAns = answers.find(a => a.question_index === idx && a.user_id === userId);
                return (
                  <tr key={idx} className="border-b border-border last:border-0">
                    <td className="p-3 font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="p-3">{myAns?.is_correct ? '✅' : '❌'} {myAns?.selected_answer}</td>
                    {otherParticipants.map(p => {
                      const a = answers.find(a => a.question_index === idx && a.user_id === p.user_id);
                      return <td key={p.id} className="p-3">{a?.is_correct ? '✅' : '❌'} {a?.selected_answer}</td>;
                    })}
                    <td className="p-3 font-bold text-primary">{q?.[KEYS.CORRECT]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          <Button onClick={() => { setPhase('lobby'); stopPolling(); }} variant="outline" className="flex-1 py-6">
            שחק שוב
          </Button>
          <Button onClick={() => navigate('home')} className="flex-1 py-6">
            חזור לדף הבית
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
