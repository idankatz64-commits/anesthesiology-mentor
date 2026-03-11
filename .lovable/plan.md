

## תוכנית: עדכון עיצוב Sidebar + TopNav

התאמת שני הרכיבים לשפה העיצובית של האפליקציה — Dark Charcoal/Slate עם Amber Gold, glassmorphism, ואנימציות framer-motion.

---

### 1. TopNav — עיצוב מחודש

**רקע**: שדרוג מ-`bg-card/60` ל-`bg-white/[0.03] backdrop-blur-xl` (glassmorphism אחיד עם שאר האפליקציה). border תחתון עם gradient amber עדין יותר.

**כותרת מרכזית**: הוספת אייקון קטן (Stethoscope או Activity) ב-amber לצד הטקסט "Simulator for Stage 1...". הקטנת הפונט במובייל (`text-xs md:text-sm`) ושמירתו ב-LTR. הוספת שורה שנייה עם כיתוב עברי קצר או הסתרתה במובייל.

**כפתור NotebookLM**: שדרוג לאייקון עם `bg-white/[0.03]` ו-border דק `border-white/10`, hover amber glow.

**אזור משתמש**: avatar circle עם `bg-primary/15` ו-border amber — שדרוג ה-dropdown ל-glass-card עם `bg-white/[0.05] backdrop-blur-xl border-white/10`. הוספת אנימציית framer-motion fade+slide ל-dropdown.

**כפתורי Login/Signup**: כפתור "הרשם" — amber מלא עם glow shadow. כפתור "התחבר" — ghost עם border דק.

**Sync indicator**: עיצוב אחיד עם pill amber.

---

### 2. Sidebar — עיצוב מחודש

**Container**: שדרוג מ-`glass-card` ל-`bg-white/[0.03] backdrop-blur-xl border-l border-white/10` — glassmorphism אמיתי.

**Header**: אייקון ב-`bg-primary/10` עם amber glow עדין. טקסט "סימולטור" בפונט bold, תת-כותרת muted.

**Nav items**: הגדלת padding ל-`py-3.5`, הוספת hover effect `bg-white/[0.05]`. Active indicator — amber border-right + `bg-primary/8` עם subtle amber inner glow (שמירת ה-layoutId animation הקיים).

**Footer buttons** (Feedback, Theme, Admin): שדרוג ל-`bg-white/[0.04] border border-white/8 hover:border-primary/30` — גישה אחידה של glass buttons.

**Progress bar**: שדרוג עם amber gradient ו-glow animation. הוספת label "PROGRESS" באנגלית uppercase עם tracking-widest (תואם לשפה העיצובית של הכותרות במסכים אחרים).

**Collapse toggle**: שדרוג לעיגול amber-on-hover עם transition חלק.

---

### קבצים שישתנו

| קובץ | שינוי |
|---|---|
| `src/components/TopNav.tsx` | עיצוב glassmorphism, dropdown animation, אייקון לכותרת |
| `src/components/Sidebar.tsx` | עיצוב glassmorphism, nav items, footer, progress bar |

כל הלוגיקה נשמרת — שינוי ויזואלי בלבד.

