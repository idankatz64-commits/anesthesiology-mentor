import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ArrowRight, Upload, Plus, Trash2, RotateCcw, CheckCircle2, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

type Deck = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  totalCards: number;
  dueCards: number;
};

type AnkiCard = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  due_date: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
};

export default function AnkiView() {
  const [phase, setPhase] = useState<'decks' | 'study'>('decks');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [studyCards, setStudyCards] = useState<AnkiCard[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Import state
  const [importText, setImportText] = useState('');
  const [importDeckName, setImportDeckName] = useState('');
  const [importPreview, setImportPreview] = useState<{ front: string; back: string }[]>([]);

  // Create state
  const [createFront, setCreateFront] = useState('');
  const [createBack, setCreateBack] = useState('');
  const [createDeckId, setCreateDeckId] = useState('');
  const [createNewDeckName, setCreateNewDeckName] = useState('');

  const fetchDecks = useCallback(async (uid: string) => {
    const { data: deckRows } = await supabase
      .from('anki_decks')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!deckRows) { setDecks([]); return; }

    const now = new Date().toISOString();
    const enriched: Deck[] = await Promise.all(
      deckRows.map(async (d: any) => {
        const { count: totalCards } = await supabase
          .from('anki_cards')
          .select('*', { count: 'exact', head: true })
          .eq('deck_id', d.id);

        const { count: dueCards } = await supabase
          .from('anki_cards')
          .select('*', { count: 'exact', head: true })
          .eq('deck_id', d.id)
          .lte('due_date', now);

        return { ...d, totalCards: totalCards ?? 0, dueCards: dueCards ?? 0 };
      })
    );
    setDecks(enriched);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        fetchDecks(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [fetchDecks]);

  // Parse import text
  useEffect(() => {
    if (!importText.trim()) { setImportPreview([]); return; }
    const lines = importText.trim().split('\n').filter(l => l.includes('\t'));
    setImportPreview(lines.slice(0, 5).map(l => {
      const [front, ...rest] = l.split('\t');
      return { front: front?.trim() || '', back: rest.join('\t').trim() };
    }));
  }, [importText]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      delimiter: '\t',
      complete: (results) => {
        const lines = (results.data as string[][])
          .filter(r => r.length >= 2 && r[0]?.trim())
          .map(r => `${r[0]}\t${r.slice(1).join('\t')}`)
          .join('\n');
        setImportText(lines);
      },
    });
  };

  const handleImport = async () => {
    if (!userId || !importDeckName.trim() || !importText.trim()) {
      toast({ title: 'שגיאה', description: 'יש למלא שם חפיסה וטקסט', variant: 'destructive' });
      return;
    }
    const lines = importText.trim().split('\n').filter(l => l.includes('\t'));
    if (lines.length === 0) {
      toast({ title: 'שגיאה', description: 'לא נמצאו כרטיסיות תקינות', variant: 'destructive' });
      return;
    }

    const { data: deck, error: deckErr } = await supabase
      .from('anki_decks')
      .insert({ user_id: userId, name: importDeckName.trim() })
      .select()
      .single();

    if (deckErr || !deck) {
      toast({ title: 'שגיאה', description: 'לא ניתן ליצור חפיסה', variant: 'destructive' });
      return;
    }

    const cards = lines.map(l => {
      const [front, ...rest] = l.split('\t');
      return { deck_id: deck.id, user_id: userId, front: front?.trim() || '', back: rest.join('\t').trim() };
    });

    const { error: cardsErr } = await supabase.from('anki_cards').insert(cards);
    if (cardsErr) {
      toast({ title: 'שגיאה', description: 'ייבוא נכשל', variant: 'destructive' });
      return;
    }

    toast({ title: 'הצלחה', description: `${cards.length} כרטיסיות יובאו לחפיסה "${deck.name}"` });
    setImportText('');
    setImportDeckName('');
    setImportPreview([]);
    fetchDecks(userId);
  };

  const handleCreateCard = async () => {
    if (!userId || !createFront.trim() || !createBack.trim()) {
      toast({ title: 'שגיאה', description: 'יש למלא חזית וגב', variant: 'destructive' });
      return;
    }

    let deckId = createDeckId;

    if (deckId === '__new__' || (!deckId && createNewDeckName.trim())) {
      if (!createNewDeckName.trim()) {
        toast({ title: 'שגיאה', description: 'יש להזין שם חפיסה', variant: 'destructive' });
        return;
      }
      const { data: newDeck, error } = await supabase
        .from('anki_decks')
        .insert({ user_id: userId, name: createNewDeckName.trim() })
        .select()
        .single();
      if (error || !newDeck) {
        toast({ title: 'שגיאה', description: 'לא ניתן ליצור חפיסה', variant: 'destructive' });
        return;
      }
      deckId = newDeck.id;
    }

    if (!deckId) {
      toast({ title: 'שגיאה', description: 'יש לבחור חפיסה', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('anki_cards').insert({
      deck_id: deckId,
      user_id: userId,
      front: createFront.trim(),
      back: createBack.trim(),
    });

    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן ליצור כרטיסייה', variant: 'destructive' });
      return;
    }

    toast({ title: 'נוצרה!', description: 'כרטיסייה חדשה נוספה' });
    setCreateFront('');
    setCreateBack('');
    setCreateNewDeckName('');
    fetchDecks(userId);
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('למחוק את החפיסה וכל הכרטיסיות שבה?')) return;
    await supabase.from('anki_decks').delete().eq('id', deckId);
    if (userId) fetchDecks(userId);
  };

  const startStudy = async (deckId: string) => {
    const now = new Date().toISOString();
    const { data: cards } = await supabase
      .from('anki_cards')
      .select('*')
      .eq('deck_id', deckId)
      .lte('due_date', now)
      .order('due_date', { ascending: true });

    if (!cards || cards.length === 0) {
      toast({ title: '🎉', description: 'אין כרטיסיות לחזרה היום!' });
      return;
    }

    setStudyCards(cards as AnkiCard[]);
    setStudyIndex(0);
    setFlipped(false);
    setSelectedDeckId(deckId);
    setPhase('study');
  };

  const handleRate = async (rating: 'easy' | 'medium' | 'hard') => {
    const card = studyCards[studyIndex];
    if (!card) return;

    let newInterval = card.interval_days;
    let newEase = card.ease_factor;
    let newReps = card.repetitions;

    if (rating === 'easy') {
      newInterval = Math.ceil(newInterval * newEase);
      newEase = newEase + 0.1;
      newReps++;
    } else if (rating === 'medium') {
      newInterval = Math.ceil(newInterval * 1.5);
      newReps++;
    } else {
      newInterval = 1;
      newEase = Math.max(1.3, newEase - 0.2);
      newReps = 0;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + newInterval);

    await supabase
      .from('anki_cards')
      .update({
        interval_days: newInterval,
        ease_factor: newEase,
        repetitions: newReps,
        due_date: dueDate.toISOString(),
      })
      .eq('id', card.id);

    setFlipped(false);
    if (studyIndex + 1 < studyCards.length) {
      setStudyIndex(studyIndex + 1);
    } else {
      setStudyIndex(studyCards.length); // triggers completion
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">טוען...</div>;
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
        יש להתחבר כדי להשתמש בכרטיסיות Anki
      </div>
    );
  }

  // Study mode
  if (phase === 'study') {
    const currentCard = studyCards[studyIndex];
    const isComplete = studyIndex >= studyCards.length;
    const remaining = studyCards.length - studyIndex;
    const progressPct = studyCards.length > 0 ? ((studyIndex) / studyCards.length) * 100 : 100;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => { setPhase('decks'); if (userId) fetchDecks(userId); }}>
            <ArrowRight className="w-4 h-4 ml-2" />
            חזרה לחפיסות
          </Button>
          {!isComplete && (
            <span className="text-sm text-muted-foreground">{remaining} כרטיסיות נותרו להיום</span>
          )}
        </div>

        <Progress value={progressPct} className="h-2" />

        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16 space-y-4"
            >
              <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
              <h2 className="text-2xl font-bold text-foreground">כל הכבוד! 🎉</h2>
              <p className="text-muted-foreground">סיימת את כל הכרטיסיות להיום</p>
              <Button onClick={() => { setPhase('decks'); if (userId) fetchDecks(userId); }}>חזרה לחפיסות</Button>
            </motion.div>
          ) : currentCard && (
            <motion.div
              key={currentCard.id + (flipped ? '-back' : '-front')}
              initial={{ opacity: 0, rotateY: flipped ? 180 : 0 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="min-h-[300px] flex flex-col items-center justify-center cursor-pointer" onClick={() => !flipped && setFlipped(true)}>
                <CardContent className="p-8 text-center w-full">
                  {!flipped ? (
                    <div className="space-y-6">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">חזית</p>
                      <p className="text-xl font-semibold text-foreground leading-relaxed whitespace-pre-wrap">{currentCard.front}</p>
                      <Button variant="outline" onClick={(e) => { e.stopPropagation(); setFlipped(true); }}>
                        הצג תשובה
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">גב</p>
                      <p className="text-xl font-semibold text-foreground leading-relaxed whitespace-pre-wrap">{currentCard.back}</p>
                      <div className="flex gap-3 justify-center pt-4">
                        <Button variant="destructive" size="lg" onClick={() => handleRate('hard')}>
                          קשה 😰
                        </Button>
                        <Button variant="secondary" size="lg" onClick={() => handleRate('medium')}>
                          בינוני 😐
                        </Button>
                        <Button size="lg" onClick={() => handleRate('easy')}>
                          קל 😊
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Deck tabs view
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">כרטיסיות Anki</h1>
      </div>

      <Tabs defaultValue="my-decks" dir="rtl">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="my-decks">הכרטיסיות שלי</TabsTrigger>
          <TabsTrigger value="import">ייבוא</TabsTrigger>
          <TabsTrigger value="create">צור כרטיסייה</TabsTrigger>
        </TabsList>

        {/* Tab 1: My Decks */}
        <TabsContent value="my-decks" className="mt-4">
          {decks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>אין חפיסות עדיין. צור חפיסה חדשה או ייבא כרטיסיות!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {decks.map(deck => (
                <Card key={deck.id} className="hover:shadow-lg transition-shadow cursor-pointer group relative" onClick={() => startStudy(deck.id)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{deck.name}</CardTitle>
                    {deck.description && <p className="text-xs text-muted-foreground">{deck.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">סה״כ כרטיסיות</span>
                      <span className="font-bold text-foreground">{deck.totalCards}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">לחזרה היום</span>
                      <span className={`font-bold ${deck.dueCards > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{deck.dueCards}</span>
                    </div>
                  </CardContent>
                  <button
                    className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                    title="מחק חפיסה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Import */}
        <TabsContent value="import" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">שם חפיסה</label>
                <Input value={importDeckName} onChange={e => setImportDeckName(e.target.value)} placeholder="למשל: פרמקולוגיה..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">הדבק טקסט (חזית[TAB]גב, שורה לכל כרטיסייה)</label>
                <Textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={"Propofol\tInduction agent, GABA agonist\nKetamine\tDissociative anesthetic, NMDA antagonist"}
                  rows={6}
                  dir="ltr"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">או העלה קובץ:</label>
                <Input type="file" accept=".txt,.csv" onChange={handleFileUpload} className="max-w-xs" />
              </div>

              {importPreview.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">תצוגה מקדימה ({Math.min(5, importPreview.length)} מתוך {importText.trim().split('\n').filter(l => l.includes('\t')).length})</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">חזית</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">גב</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">{row.front}</td>
                          <td className="px-3 py-2 text-foreground">{row.back}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Button onClick={handleImport} disabled={!importDeckName.trim() || !importText.trim()}>
                <Upload className="w-4 h-4 ml-2" />
                ייבא כרטיסיות
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Create */}
        <TabsContent value="create" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">חפיסה</label>
                <Select value={createDeckId} onValueChange={setCreateDeckId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר חפיסה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {decks.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ חפיסה חדשה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createDeckId === '__new__' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">שם חפיסה חדשה</label>
                  <Input value={createNewDeckName} onChange={e => setCreateNewDeckName(e.target.value)} placeholder="שם החפיסה..." />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">חזית (שאלה / מונח)</label>
                <Textarea value={createFront} onChange={e => setCreateFront(e.target.value)} placeholder="מה מנגנון הפעולה של Propofol?" rows={3} />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">גב (תשובה)</label>
                <Textarea value={createBack} onChange={e => setCreateBack(e.target.value)} placeholder="אגוניסט GABA-A, מפחית הכרה תוך שניות..." rows={3} />
              </div>

              <Button onClick={handleCreateCard} disabled={!createFront.trim() || !createBack.trim()}>
                <Plus className="w-4 h-4 ml-2" />
                שמור כרטיסייה
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
