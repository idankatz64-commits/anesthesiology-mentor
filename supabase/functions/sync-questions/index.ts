import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.224.0/csv/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLqVYyyxd2HTiccI520BEhLE29HV0G6BVUkDyKnXNvCJ_c41WZBGJyfLcbGTeRGZr8k2-Uq0VukZg2/pub?gid=1958019419&single=true&output=csv";

// ─── Keyword-based topic classifier ───────────────────────────────────────────
// Each entry: [topic_name, [keywords...]]
// Keywords are matched case-insensitively against the combined question+options text.
// The topic with the most keyword hits wins.
const TOPIC_RULES: [string, string[]][] = [
  [
    "Pharmacology of Neuromuscular Blocking Drugs and Antagonists (Reversal Agents)",
    [
      "succinylcholine",
      "suxamethonium",
      "rocuronium",
      "vecuronium",
      "atracurium",
      "cisatracurium",
      "mivacurium",
      "pancuronium",
      "NMB",
      "neuromuscular block",
      "neostigmine",
      "sugammadex",
      "reversal agent",
      "decurarization",
      "anticholinesterase",
      "TOF ratio",
      "fade",
      "post-tetanic",
      "משתקי שריר",
      "גוש עצבי שרירי",
      "נאוסטיגמין",
      "סוגמדקס",
      "רוקורוניום",
      "ווקורוניום",
    ],
  ],
  [
    "Neuromuscular Physiology and Pharmacology",
    [
      "neuromuscular junction",
      "motor end plate",
      "acetylcholine release",
      "nicotinic receptor",
      "NMJ",
      "quantal release",
      "presynaptic",
      "postsynaptic receptor",
      "acetylcholinesterase",
      "end plate potential",
      "NDMB physiology",
      "axon terminal",
      "synaptic cleft",
      "צומת עצבי שרירי",
      "אצטילכולין",
      "מנשא קצה",
      "רצפטור ניקוטיני",
      "פוטנטיות משתק שריר",
    ],
  ],
  [
    "Neuromuscular Monitoring",
    [
      "train of four",
      "TOF monitoring",
      "PTC",
      "post-tetanic count",
      "double burst",
      "acceleromyography",
      "tetanic stimulation",
      "nerve stimulator",
      "fade monitoring",
      "neuromuscular monitoring",
      "TOF watch",
      "mechanomyography",
    ],
  ],
  [
    "Respiratory Physiology and Pathophysiology",
    [
      "lung volume",
      "FRC",
      "TLC",
      "residual volume",
      "vital capacity",
      "FEV1",
      "FVC",
      "tidal volume",
      "compliance lung",
      "surfactant",
      "alveolar ventilation",
      "V/Q",
      "dead space",
      "HPV",
      "hypoxic pulmonary vasoconstriction",
      "COPD",
      "asthma",
      "bronchospasm",
      "airway resistance",
      "respiratory physiology",
      "pulmonary physiology",
      "minute ventilation",
      "work of breathing",
      "lung compliance",
      "elastic recoil",
      "pneumothorax",
      "pleural",
      "respiratory muscle",
      "ריאה",
      "נפחי ריאה",
      "FRC",
      "היענות ריאה",
      "כיווץ סמפונות",
      "COPD",
      "אסתמה",
      "אוורור שלפוחית",
    ],
  ],
  [
    "Respiratory Monitoring",
    [
      "SpO2",
      "pulse oximetry",
      "capnography",
      "ETCO2",
      "end-tidal CO2",
      "capnogram",
      "waveform CO2",
      "respiratory rate monitor",
      "spirometry loop",
      "flow-volume loop",
      "minute volume monitor",
      "oxygen saturation monitor",
      "oximetry",
      "EtCO2",
      "קפנוגרפיה",
      "ניטור נשימה",
      "ריווי חמצן",
      "SpO2",
      "ETCO2",
    ],
  ],
  [
    "Cerebral Physiology and the Effects of Anesthetic Drugs",
    [
      "CBF",
      "cerebral blood flow",
      "CMR",
      "cerebral metabolic rate",
      "ICP",
      "intracranial pressure",
      "BBB",
      "blood brain barrier",
      "autoregulation cerebral",
      "cerebrovascular reactivity",
      "EEG",
      "BIS",
      "bispectral",
      "cerebral effects",
      "brain physiology",
      "cerebrovascular",
      "intracranial compliance",
      "Monroe-Kellie",
      "brain edema",
      "CMRO2",
      "volatile cerebral",
      "מוח",
      "לחץ תוך גולגולתי",
      "זרימת דם מוחית",
      "BIS",
      "EEG",
      "מטבוליזם מוחי",
      "מחסום דם מוח",
    ],
  ],
  [
    "Inhaled Anesthetic Delivery Systems",
    [
      "vaporizer",
      "circle system",
      "Mapleson",
      "fresh gas flow",
      "FGF",
      "rebreathing",
      "soda lime",
      "CO2 absorber",
      "anesthesia machine",
      "flowmeter",
      "closed circuit",
      "semiclosed circuit",
      "anesthetic circuit",
      "bag",
      "APL valve",
      "pop-off valve",
      "bellows",
      "absorber",
      "אמבו",
      "מחזור נשימה",
      "מאיד",
      "מכונת הרדמה",
      "circuit",
      "מחסן CO2",
    ],
  ],
  [
    "Inhaled Anesthetic Uptake, Distribution, Metabolism and Toxicity",
    [
      "MAC",
      "minimum alveolar concentration",
      "FA/FI",
      "blood-gas partition",
      "Ostwald coefficient",
      "halothane",
      "sevoflurane",
      "isoflurane",
      "desflurane",
      "nitrous oxide",
      "N2O",
      "volatile uptake",
      "anesthetic uptake",
      "distribution inhaled",
      "fluoride toxicity",
      "compound A",
      "hepatotoxicity inhaled",
      "rubber solubility",
      "oil-gas partition",
      "second gas effect",
      "concentration effect",
      "סווופלורן",
      "דספלורן",
      "איזופלורן",
      "הלותן",
      "חנקן חד-חמצני",
      "MAC",
      "ספיגת גז הרדמה",
    ],
  ],
  [
    "Inhaled Anesthetics: Mechanisms of Action",
    [
      "mechanism of inhaled",
      "GABA-A inhaled",
      "NMDA inhaled",
      "molecular mechanism anesthetic",
      "Meyer-Overton",
      "Franks Lieb",
      "protein receptor inhaled",
      "lipid theory",
      "critical volume",
      "two-pore domain",
      "TREK",
      "unitary theory",
      "mechanistic theory anesthesia",
      "מנגנון גז הרדמה",
      "מנגנון הרדמה כללית",
    ],
  ],
  [
    "Intravenous Anesthetics",
    [
      "propofol",
      "ketamine",
      "etomidate",
      "thiopental",
      "methohexital",
      "TIVA",
      "IV induction",
      "barbiturate induction",
      "dexmedetomidine",
      "midazolam induction",
      "benzodiazepine induction",
      "induction agent",
      "total intravenous",
      "intravenous anesthetic",
      "פרופופול",
      "קטמין",
      "אטומידאט",
      "תיופנטל",
      "TIVA",
      "חומר השראה תוך-ורידי",
    ],
  ],
  [
    "Opioids",
    [
      "fentanyl",
      "morphine",
      "opioid",
      "opiates",
      "naloxone",
      "remifentanil",
      "sufentanil",
      "alfentanil",
      "opioid receptor",
      "mu receptor",
      "kappa receptor",
      "codeine",
      "meperidine",
      "hydromorphone",
      "methadone",
      "opioid tolerance",
      "opioid-induced",
      "nalbuphine",
      "buprenorphine",
      "אופיואיד",
      "מורפין",
      "פנטניל",
      "רמיפנטניל",
      "נלוקסון",
      "רצפטור אופיואיד",
    ],
  ],
  [
    "Cardiac Physiology",
    [
      "SA node",
      "AV node",
      "cardiac action potential",
      "Frank-Starling",
      "preload",
      "afterload",
      "cardiac output",
      "stroke volume",
      "Laplace heart",
      "cardiac cycle",
      "myocardial oxygen demand",
      "LVEDP",
      "SVR",
      "PVR",
      "ejection fraction",
      "diastole",
      "systole",
      "coronary flow",
      "Starling curve",
      "ventricular function",
      "cardiac index",
      "heart rate physiology",
      "conduction system",
      "bundle of His",
      "ventricular pressure",
      "myocardial contractility",
      "פיזיולוגיה לבבית",
      "דביט לב",
      "עומס מוקדם",
      "עומס מאוחר",
      "תנועת לב",
      "לב",
    ],
  ],
  [
    "Cardiovascular Monitoring",
    [
      "PA catheter",
      "Swan-Ganz",
      "pulmonary artery catheter",
      "CVP",
      "central venous pressure",
      "IBP",
      "arterial line",
      "PCWP",
      "pulmonary capillary wedge",
      "cardiac output thermodilution",
      "hemodynamic monitoring",
      "CVP waveform",
      "A-line",
      "pulmonary artery",
      "ניטור המודינמי",
      "קטטר עורק ריאתי",
      "לחץ ורידי מרכזי",
      "קו עורקי",
    ],
  ],
  [
    "Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations",
    [
      "liver anatomy",
      "hepatic blood flow",
      "liver physiology",
      "hepatic metabolism",
      "portal hypertension",
      "cirrhosis",
      "liver function test",
      "biliary",
      "bile acid",
      "hepatocyte",
      "cytochrome P450",
      "CYP",
      "glucuronidation",
      "hepatic clearance",
      "first-pass",
      "GI physiology",
      "gastric emptying",
      "gastric acid",
      "bowel",
      "intestinal",
      "GI motility",
      "esophagus",
      "gastroesophageal",
      "nausea physiology",
      "vomiting reflex",
      "upper GI",
      "כבד",
      "הפטי",
      "פיזיולוגיה כבדית",
      "מחסור בכבד",
      "זרימת דם כבדי",
      "מטבוליזם כבדי",
    ],
  ],
  [
    "Renal Anatomy, Physiology, Pharmacology, and Evaluation of Function",
    [
      "kidney",
      "renal blood flow",
      "GFR",
      "glomerular filtration",
      "creatinine clearance",
      "tubular reabsorption",
      "loop of Henle",
      "nephron",
      "proximal tubule",
      "distal tubule",
      "ADH",
      "antidiuretic",
      "renin",
      "aldosterone",
      "renal clearance",
      "renal anatomy",
      "afferent arteriole",
      "efferent arteriole",
      "Bowman",
      "filtration fraction",
      "כליה",
      "פיזיולוגיה כלייתית",
      "GFR",
      "קרטינין",
      "נברון",
      "לולאת הנלה",
      "אלדוסטרון",
      "רנין",
    ],
  ],
  [
    "Renal Pathophysiology and Treatment for Perioperative Ischemia and Nephrotoxic Injury",
    [
      "acute kidney injury",
      "AKI",
      "renal ischemia",
      "nephrotoxic",
      "contrast nephropathy",
      "renal protection",
      "renal failure perioperative",
      "oliguria management",
      "prerenal",
      "intrinsic renal",
      "postrenal",
      "KDIGO",
      "creatinine rise postop",
      "פגיעה כלייתית חריפה",
      "AKI",
      "נפרוטוקסיות",
    ],
  ],
  [
    "Perioperative Acid–Base Balance",
    [
      "pH",
      "bicarbonate",
      "acidosis",
      "alkalosis",
      "PaCO2",
      "base excess",
      "deficit",
      "Henderson-Hasselbalch",
      "metabolic acidosis",
      "metabolic alkalosis",
      "respiratory acidosis",
      "respiratory alkalosis",
      "ABG",
      "blood gas",
      "strong ion difference",
      "Stewart approach",
      "lactic acidosis",
      "anion gap",
      "buffer",
      "pH",
      "חומצה-בסיס",
      "חמצת",
      "אלקלוזיס",
      "ביקרבונט",
      "גז דם",
      "עודף בסיס",
    ],
  ],
  [
    "Perioperative Fluid and Electrolyte Therapy",
    [
      "fluid therapy",
      "crystalloid",
      "colloid",
      "normal saline",
      "lactated Ringer",
      "albumin",
      "hyponatremia",
      "hypernatremia",
      "hypokalemia",
      "hyperkalemia",
      "fluid balance",
      "tonicity",
      "osmolality",
      "sodium correction",
      "potassium replacement",
      "fluid resuscitation",
      "isotonic",
      "hypotonic",
      "hypertonic",
      "electrolyte imbalance",
      "TURP syndrome",
      "נוזלים",
      "אלקטרוליטים",
      "נתרן",
      "אשלגן",
      "תמיסה",
      "עירוי נוזלים",
    ],
  ],
  [
    "Spinal, Epidural, and Caudal Anesthesia",
    [
      "spinal anesthesia",
      "epidural anesthesia",
      "subarachnoid block",
      "intrathecal",
      "caudal block",
      "saddle block",
      "baricity",
      "hyperbaric spinal",
      "isobaric",
      "level of block",
      "neuraxial",
      "epidural catheter",
      "combined spinal epidural",
      "CSE",
      "dural puncture",
      "spinal headache",
      "PDPH",
      "total spinal",
      "epidural hematoma",
      "אנסתזיה ספינלית",
      "אנסתזיה אפידורלית",
      "בלוק תת-עכבישי",
      "אפידורל",
      "ספינל",
    ],
  ],
  [
    "Peripheral Nerve Blocks and Ultrasound Guidance for Regional Anesthesia",
    [
      "brachial plexus",
      "femoral nerve",
      "sciatic nerve block",
      "popliteal block",
      "axillary block",
      "interscalene",
      "supraclavicular",
      "infraclavicular",
      "adductor canal",
      "TAP block",
      "PECS block",
      "erector spinae",
      "ultrasound guided block",
      "peripheral nerve block",
      "nerve stimulator block",
      "regional anesthesia",
      "fascial plane block",
      "בלוק עצבי",
      "עצב יריכי",
      "פלקסוס ברכיאלי",
      "אנסתזיה אזורית",
      "אולטרסאונד",
    ],
  ],
  [
    "Local Anesthetics",
    [
      "lidocaine",
      "bupivacaine",
      "ropivacaine",
      "prilocaine",
      "mepivacaine",
      "chloroprocaine",
      "local anesthetic toxicity",
      "LAST",
      "sodium channel block",
      "local anesthetic mechanism",
      "vasoconstrictor local",
      "epinephrine local",
      "onset local",
      "duration local",
      "pKa local anesthetic",
      "methemoglobinemia",
      "intrinsic activity local",
      "לידוקאין",
      "בופיווקאין",
      "רופיווקאין",
      "מקומי",
      "ערוץ נתרן",
      "רעילות מקומית",
    ],
  ],
  [
    "Anesthesia for Obstetrics",
    [
      "pregnancy",
      "obstetric",
      "cesarean",
      "C-section",
      "epidural labor",
      "labor analgesia",
      "fetal",
      "maternal",
      "eclampsia",
      "preeclampsia",
      "HELLP",
      "uterus",
      "amniotic",
      "parturient",
      "gravid",
      "placenta",
      "aortocaval compression",
      "oxytocin",
      "ergometrine",
      "הריון",
      "יולדת",
      "לידה",
      "קיסרי",
      "ניתוח קיסרי",
      "אפידורל לידה",
      "פרה-אקלמפסיה",
      "עקה",
    ],
  ],
  [
    "Pediatric Anesthesia",
    [
      "pediatric",
      "infant",
      "child anesthesia",
      "neonate",
      "newborn",
      "neonatal",
      "congenital pediatric",
      "laryngotracheitis",
      "croup",
      "pediatric airway",
      "uncuffed tube",
      "weight-based dosing",
      "pediatric pharmacology",
      "children surgery",
      "pyloric stenosis",
      "ילד",
      "פדיאטרי",
      "יילוד",
      "תינוק",
      "הרדמת ילדים",
    ],
  ],
  [
    "Pediatric and Neonatal Critical Care",
    [
      "neonatal ICU",
      "NICU",
      "neonatal critical",
      "pediatric ICU",
      "PICU",
      "neonatal resuscitation",
      "newborn stabilization",
      "pediatric sepsis",
      "neonatal ventilation",
      "ICU יילודים",
      "NICU",
      "טיפול נמרץ ילדים",
    ],
  ],
  [
    "Airway Management in the Adult",
    [
      "intubation",
      "laryngoscopy",
      "direct laryngoscopy",
      "video laryngoscopy",
      "ETT",
      "endotracheal tube",
      "LMA",
      "laryngeal mask airway",
      "RSI",
      "rapid sequence induction",
      "cricothyrotomy",
      "difficult airway",
      "mask ventilation",
      "BURP",
      "Cormack-Lehane",
      "trachea",
      "tracheostomy",
      "bougie",
      "stylet",
      "fiberoptic",
      "nasal intubation",
      "awake intubation",
      "אינטובציה",
      "לרינגוסקופיה",
      "ניהול דרכי אוויר",
      "LMA",
      "מסיכה",
      "קנה נשימה",
    ],
  ],
  [
    "Patient Blood Management: Coagulation",
    [
      "coagulation",
      "INR",
      "warfarin",
      "heparin",
      "platelet function",
      "fibrinogen",
      "thrombus",
      "DVT",
      "anticoagulation",
      "coagulopathy",
      "HIT",
      "thrombocytopenia",
      "TEG",
      "ROTEM",
      "von Willebrand",
      "coagulation cascade",
      "hemostasis",
      "factor VIII",
      "factor IX",
      "thromboelastography",
      "prothrombin",
      "aPTT",
      "TXA",
      "tranexamic acid",
      "קרישה",
      "ורפרין",
      "הפרין",
      "טסיות",
      "קריש",
      "קרישיות יתר",
      "קרישיות חסר",
      "טרומבוס",
    ],
  ],
  [
    "Patient Blood Management: Transfusion Therapy",
    [
      "transfusion",
      "blood products",
      "packed red cells",
      "pRBC",
      "FFP",
      "fresh frozen plasma",
      "cryoprecipitate",
      "massive transfusion protocol",
      "MTP",
      "blood bank",
      "crossmatch",
      "autologous blood",
      "cell salvage",
      "transfusion reaction",
      "hemolytic",
      "TRALI",
      "transfusion trigger",
      "blood loss management",
      "עירוי דם",
      "מוצרי דם",
      "פלזמה",
      "כדוריות אדומות",
      "פרוטוקול עירוי מאסיבי",
    ],
  ],
  [
    "Anesthesia for Cardiac Surgical Procedures",
    [
      "CPB",
      "cardiopulmonary bypass",
      "coronary",
      "CABG",
      "valve surgery",
      "cardiac surgery",
      "bypass circuit",
      "cardioplegia",
      "heart surgery",
      "aortic valve",
      "mitral valve",
      "OPCAB",
      "off-pump",
      "sternotomy",
      "internal mammary",
      "saphenous vein graft",
      "IABP",
      "bypass surgery",
      "cardiac surgical",
      "perfusionist",
      "מעקף לב",
      "ניתוח לב",
      "bypass",
      "קרדיופלגיה",
      "ניתוח מסתמים",
      "מסתם אאורטה",
    ],
  ],
  [
    "Anesthesia for Cardiac Surgical Procedures",
    [
      // merging arrhythmia correction here
      "cardioversion",
      "ablation cardiac",
      "electrophysiology",
      "EP study",
      "atrial fibrillation treatment",
      "flutter ablation",
      "WPW",
      "SVT treatment",
      "radiofrequency ablation",
    ],
  ],
  [
    "Anesthesia for Neurologic Surgery and Neurointerventions",
    [
      "neurosurgery",
      "craniotomy",
      "brain tumor",
      "intracranial surgery",
      "cerebrovascular surgery",
      "brain aneurysm",
      "AVM",
      "neurointerventions",
      "spinal cord surgery",
      "awake craniotomy",
      "cerebral aneurysm clipping",
      "coiling",
      "embolization",
      "intracranial hypertension management",
      "brain retraction",
      "brain relaxation",
      "mannitol hyperventilation",
      "ניתוח מוח",
      "קרניוטומיה",
      "גידול מוחי",
      "אנסתזיה נוירולוגית",
    ],
  ],
  [
    "Preoperative Evaluation",
    [
      "preoperative assessment",
      "NPO",
      "fasting",
      "ASA classification",
      "risk stratification preop",
      "METS",
      "functional capacity",
      "preoperative workup",
      "cardiac risk preop",
      "preoperative medication",
      "preoperative testing",
      "preoperative history",
      "preoperative exam",
      "consent anesthesia",
      "preop visit",
      "הערכה טרום-ניתוחית",
      "NPO",
      "צום",
      "הכנה לניתוח",
      "ASA classification",
    ],
  ],
  [
    "Anesthesia for Trauma",
    [
      "trauma anesthesia",
      "polytrauma",
      "damage control",
      "ATLS",
      "emergency trauma",
      "hemorrhagic shock",
      "massive hemorrhage",
      "blast injury",
      "penetrating trauma",
      "blunt trauma",
      "damage control resuscitation",
      "traumatic coagulopathy",
      "טראומה",
      "ניתוח חירום",
      "שוק היפוולמי",
      "ניהול טראומה",
    ],
  ],
  [
    "Basic Principles of Pharmacology",
    [
      "pharmacokinetics",
      "volume of distribution",
      "half-life",
      "clearance drug",
      "bioavailability",
      "protein binding",
      "first-pass metabolism",
      "receptor affinity",
      "drug-receptor interaction",
      "ED50",
      "IC50",
      "pharmacodynamics",
      "phase I metabolism",
      "phase II metabolism",
      "CYP",
      "glucuronidation",
      "drug interaction",
      "dose-response",
      "therapeutic index",
      "hepatic metabolism drug",
      "renal excretion drug",
      "Vd",
      "Cl",
      "t1/2",
      "פרמקוקינטיקה",
      "פרמקודינמיקה",
      "חצי חיים",
      "נפח חלוקה",
      "קישור לחלבון",
      "מטבוליזם תרופות",
    ],
  ],
  [
    "Anesthetic Implications of Concurrent Diseases",
    [
      "diabetes mellitus perioperative",
      "hypertension management perioperative",
      "obesity anesthesia",
      "liver disease anesthesia",
      "renal failure anesthesia",
      "concurrent disease",
      "comorbidity anesthesia",
      "COPD anesthesia",
      "cardiac disease periop",
      "rheumatoid",
      "thyroid anesthesia",
      "pheochromocytoma",
      "carcinoid",
      "concurrent illness",
      "sickle cell",
      "obesity hypoventilation",
      "OSA management",
      "pulmonary hypertension anesthesia",
      "מחלת רקע",
      "סוכרת",
      "יתר לחץ דם",
      "מחלה נלווית",
      "הרדמה ומחלות רקע",
    ],
  ],
  [
    "Sleep Medicine",
    [
      "sleep apnea",
      "OSA",
      "obstructive sleep apnea",
      "REM",
      "NREM",
      "arousal system",
      "sleep disorder",
      "somnolence",
      "circadian",
      "sleep-wake cycle",
      "hypnopompic",
      "hypnagogic",
      "CPAP",
      "BIPAP",
      "polysomnography",
      "sleep study",
      "Epworth",
      "Mallampati OSA",
      "שינה",
      "OSA",
      "דום נשימה בשינה",
      "REM",
      "NREM",
      "מחזור שינה",
    ],
  ],
  [
    "ACLS",
    [
      "cardiac arrest",
      "CPR",
      "resuscitation",
      "defibrillation",
      "epinephrine arrest",
      "ventricular fibrillation",
      "VF",
      "pulseless",
      "AED",
      "advanced cardiac life support",
      "pulseless electrical activity",
      "PEA",
      "asystole",
      "ROSC",
      "post-resuscitation",
      "הנפשה",
      "CPR",
      "דפיברילציה",
      "דום לב",
      "פרפור חדרים",
      "ACLS",
    ],
  ],
  [
    "Cardiopulmonary Resuscitation and Advanced Cardiac Life Support",
    [
      "CPR",
      "resuscitation",
      "cardiopulmonary resuscitation",
      "ALS",
      "cardiac life support",
      "ventricular fibrillation VF",
      "defibrillation protocol",
      "ROSC",
    ],
  ],
  [
    "Implantable Cardiac Pulse Generators: Pacemakers and Cardioverter-Defibrillators",
    [
      "pacemaker",
      "ICD",
      "implantable cardioverter",
      "defibrillator",
      "cardiac device",
      "pulse generator",
      "pacing",
      "DDD",
      "VVI",
      "electrocautery pacemaker",
      "magnet pacemaker",
      "קוצב לב",
      "ICD",
      "מכשיר קצב",
      "פייסמייקר",
      "דפיברילטור נטען",
    ],
  ],
  [
    "Perioperative Echocardiography and Point-of-Care Ultrasound (POCUS)",
    [
      "echocardiography",
      "TEE",
      "transesophageal echo",
      "LVEF",
      "wall motion abnormality",
      "POCUS",
      "point-of-care ultrasound",
      "TTE",
      "transthoracic echo",
      "echo assessment",
      "Doppler",
      "mitral regurgitation echo",
      "aortic stenosis echo",
      "pericardial effusion",
      "אקוקרדיוגרפיה",
      "TEE",
      "אולטרסאונד נקודתי",
      "POCUS",
      "LVEF",
    ],
  ],
  [
    "Patient Positioning and Associated Risks",
    [
      "lithotomy position",
      "prone position",
      "lateral decubitus",
      "Trendelenburg position",
      "nerve injury positioning",
      "pressure injury positioning",
      "compartment syndrome positioning",
      "beach chair",
      "sitting position",
      "eye positioning",
      "brachial plexus stretch",
      "תנוחה",
      "פגיעת עצב",
      "תנוחת ניתוח",
      "תנוחה נוטה",
      "אנגי",
    ],
  ],
  [
    "Anesthesia for Bariatric Surgery",
    [
      "bariatric surgery",
      "gastric bypass",
      "morbid obesity anesthesia",
      "BMI>40",
      "sleeve gastrectomy",
      "laparoscopic bariatric",
      "Roux-en-Y",
      "band surgery",
      "obese patient anesthesia",
      "הרדמה לניתוח השמנה",
      "בריאטרי",
      "גסטריק בייפס",
      "השמנת יתר קיצונית",
    ],
  ],
  [
    "Anesthesia for Ophthalmic Surgery",
    [
      "eye surgery anesthesia",
      "intraocular pressure",
      "IOP",
      "oculocardiac reflex",
      "ophthalmic anesthesia",
      "cataract anesthesia",
      "glaucoma anesthesia",
      "retinal surgery",
      "peribulbar",
      "retrobulbar",
      "orbital block",
      "succinylcholine IOP",
      "ניתוח עיניים",
      "לחץ תוך עיני",
      "IOP",
      "רפלקס עין-לב",
    ],
  ],
  [
    "Anesthesia for Otolaryngologic and Head–Neck Surgery",
    [
      "ENT anesthesia",
      "otolaryngology",
      "tonsillectomy",
      "adenoidectomy",
      "airway fire",
      "laser airway",
      "tracheal resection",
      "thyroid surgery",
      "neck dissection",
      "ear surgery",
      "sinus surgery",
      "endoscopy ENT",
      "shared airway",
      "jet ventilation ENT",
      "ניתוח אף אוזן גרון",
      "טונסילקטומיה",
      "ניתוח צוואר",
      "ניתוח גרון",
    ],
  ],
  [
    "Anesthesia for Vascular Surgery",
    [
      "vascular surgery anesthesia",
      "aortic aneurysm",
      "carotid endarterectomy",
      "peripheral vascular",
      "aortic cross-clamp",
      "AAA repair",
      "endovascular",
      "EVAR",
      "ischemia reperfusion vascular",
      "spinal cord ischemia vascular",
      "ניתוח כלי דם",
      "אנוריזמה אאורטה",
      "ניתוח ורידי",
    ],
  ],
  [
    "Anesthesia for Thoracic Surgery",
    [
      "thoracic surgery",
      "lung resection",
      "lobectomy",
      "pneumonectomy",
      "one-lung ventilation",
      "OLV",
      "double-lumen tube",
      "DLT",
      "bronchial blocker",
      "bronchoscopy",
      "mediastinoscopy",
      "thoracotomy",
      "VATS",
      "video-assisted thoracoscopic",
      "ניתוח חזה",
      "כריתת אונה",
      "אינטובציה כפולת לומן",
      "אוורור חד-ריאתי",
    ],
  ],
  [
    "Anesthesia for Robotic Surgery",
    [
      "robotic surgery anesthesia",
      "da Vinci",
      "robot-assisted",
      "robotic prostatectomy",
      "Trendelenburg robotic",
      "pneumoperitoneum robotic",
      "ניתוח רובוטי",
      "דה וינצ'י",
    ],
  ],
  [
    "Anesthesia for Orthopedic Surgery",
    [
      "orthopedic anesthesia",
      "joint replacement",
      "hip replacement",
      "knee replacement",
      "spine surgery",
      "cement reaction",
      "tourniquet",
      "bone cement implantation",
      "arthroplasty",
      "fracture ORIF",
      "shoulder surgery",
      "orthopedic regional",
      "ניתוח אורתופדי",
      "החלפת מפרק",
      "ניתוח עמוד שדרה",
      "טורניקט",
    ],
  ],
  [
    "Critical Care Anesthesiology",
    [
      "ICU anesthesia",
      "critical care",
      "intensive care",
      "multi-organ failure",
      "vasopressor",
      "norepinephrine",
      "septic shock management",
      "ARDS management",
      "mechanical ventilation ICU",
      "lung protective",
      "PEEP ICU",
      "sedation ICU",
      "טיפול נמרץ",
      "ICU",
      "מחלקת טיפול נמרץ",
      "אוורור מכני",
      "ARDS",
    ],
  ],
  [
    "ICU",
    [
      "ICU management",
      "intensive care unit",
      "critical illness",
      "vasopressor ICU",
      "weaning ventilator",
      "organ support",
      "ICU sedation",
    ],
  ],
  [
    "Extracorporeal Membrane Oxygenation and Cardiac Devices",
    [
      "ECMO",
      "extracorporeal membrane oxygenation",
      "LVAD",
      "RVAD",
      "VAD",
      "ventricular assist device",
      "intra-aortic balloon",
      "IABP",
      "Impella",
      "mechanical circulatory support",
      "ECMO cannulation",
      "ECMO",
      "VAD",
      "מכשיר עזר חדרי",
      "תמיכה מחזורית",
    ],
  ],
  [
    "Non–Operating Room Anesthesia",
    [
      "MRI anesthesia",
      "radiology anesthesia",
      "catheterization lab anesthesia",
      "non-operating room",
      "interventional radiology",
      "endoscopy sedation",
      "out-of-OR",
      "NORA",
      "electrophysiology lab anesthesia",
      "הרדמה מחוץ לחדר ניתוח",
      "MRI",
      "קתלב",
      "אנדוסקופיה",
    ],
  ],
  [
    "Geriatric Anesthesia",
    [
      "geriatric anesthesia",
      "elderly patient",
      "aging pharmacology",
      "frailty",
      "cognitive decline",
      "postoperative cognitive dysfunction",
      "POCD",
      "delirium elderly",
      "pharmacology aged",
      "הרדמת קשישים",
      "מבוגר",
      "קשיש",
      "אנסתזיה וגיל",
    ],
  ],
  [
    "The Postanesthesia Care Unit",
    [
      "recovery room",
      "PACU",
      "postanesthesia care",
      "emergence",
      "wake-up",
      "post-op care",
      "shivering postop",
      "emergence agitation",
      "delayed emergence",
      "PACU discharge",
      "חדר התאוששות",
      "PACU",
      "יקיצה",
      "התאוששות מהרדמה",
    ],
  ],
  [
    "Ambulatory (Outpatient) Anesthesia",
    [
      "ambulatory anesthesia",
      "outpatient anesthesia",
      "day surgery",
      "day case",
      "same-day surgery",
      "discharge criteria ambulatory",
      "fast-track anesthesia",
      "הרדמה יומנית",
      "ניתוח יומני",
    ],
  ],
  [
    "Anesthesia and the Renal and Genitourinary Systems",
    [
      "TURP",
      "cystoscopy",
      "prostate surgery",
      "bladder surgery",
      "urologic anesthesia",
      "nephrectomy",
      "radical cystectomy",
      "TURP syndrome",
      "urinary",
      "genitourinary",
      "ESWL",
      "lithotripsy",
      "TURP",
      "אנדוסקופיה אורולוגית",
      "ניתוח ערמונית",
    ],
  ],
  [
    "Anesthesia for Abdominal Organ Transplantation",
    [
      "liver transplant",
      "hepatic transplant",
      "kidney transplant",
      "renal transplant",
      "organ transplantation anesthesia",
      "reperfusion transplant",
      "immunosuppression anesthesia",
      "השתלת כבד",
      "השתלת כליה",
      "השתלת איבר",
    ],
  ],
  [
    "Anesthesia for Fetal Surgery and Other Fetal Therapies",
    [
      "fetal surgery",
      "EXIT procedure",
      "fetal therapy",
      "maternal-fetal",
      "fetoscopy",
      "twin-to-twin transfusion anesthesia",
      "TTTS",
      "in-utero surgery",
      "ניתוח עוברי",
      "EXIT",
      "כירורגיה עוברית",
    ],
  ],
  [
    "Anesthesia for Pediatric Cardiac Surgery",
    [
      "congenital heart disease surgery",
      "CHD anesthesia",
      "Fontan",
      "Norwood",
      "arterial switch",
      "pediatric cardiac bypass",
      "tetralogy of Fallot",
      "VSD repair",
      "ASD repair",
      "ניתוח לב מולד",
      "ניתוח לב ילדים",
    ],
  ],
  [
    "Regional Anesthesia in Children",
    [
      "caudal block pediatric",
      "pediatric regional",
      "pediatric nerve block",
      "pediatric epidural",
      "ilioinguinal child",
      "penile block",
      "TAP block child",
      "regional anesthesia neonatal",
      "אנסתזיה אזורית בילדים",
      "בלוק זנב ילדים",
    ],
  ],
  [
    "Pulmonary Pharmacology of Inhaled Anesthetics",
    [
      "pulmonary pharmacology inhaled",
      "airway effects inhaled",
      "bronchodilation volatile",
      "HPV inhibition anesthetic",
      "pulmonary resistance volatile",
      "mucociliary volatile",
      "פרמקולוגיה ריאתית גז הרדמה",
    ],
  ],
  [
    "Neurocritical Care",
    [
      "traumatic brain injury",
      "TBI anesthesia",
      "ICP management",
      "cerebral perfusion pressure",
      "CPP",
      "subarachnoid hemorrhage SAH",
      "stroke management",
      "neurocritical",
      "brain herniation",
      "midline shift",
      "decompressive craniectomy",
      "פגיעת ראש",
      "TBI",
      "לחץ תוך גולגולתי",
      "שבץ",
      "ICH",
    ],
  ],
  [
    "Neurophysiologic Monitoring",
    [
      "SSEP",
      "MEP",
      "evoked potential",
      "somatosensory evoked",
      "motor evoked",
      "intraoperative neuromonitoring",
      "IONM",
      "EEG intraop",
      "neurophysiology monitoring",
      "SSEP",
      "MEP",
      "פוטנציאלים מעוררים",
    ],
  ],
  [
    "Monitoring the Brain's Response to Anesthesia and Surgery",
    [
      "BIS monitor",
      "depth of anesthesia monitor",
      "bispectral index",
      "entropy monitor",
      "processed EEG",
      "Narcotrend",
      "sedation monitoring",
      "consciousness monitor",
      "ניטור עומק הרדמה",
      "BIS",
      "אנטרופיה",
      "עומק הרדמה",
    ],
  ],
  [
    "Neuromuscular Disorders and Other Genetic Disorders",
    [
      "myasthenia gravis",
      "muscular dystrophy",
      "myotonic dystrophy",
      "Lambert-Eaton",
      "channelopathy",
      "periodic paralysis",
      "malignant hyperthermia susceptibility",
      "King-Denborough",
      "mitochondrial disease",
      "glycogen storage",
      "neuromuscular disease",
      "מיאסתניה גרביס",
      "דיסטרופיה שרירית",
      "מיוטוניה",
      "מחלות עצבי שרירים",
    ],
  ],
  [
    "Consciousness, Memory, and Anesthesia",
    [
      "awareness under anesthesia",
      "intraoperative awareness",
      "memory anesthesia",
      "consciousness anesthesia",
      "recall",
      "anesthesia awareness",
      "wakefulness during",
      "מודעות תחת הרדמה",
      "זיכרון בהרדמה",
      "ערות",
    ],
  ],
  [
    "Management of the Patient with Chronic Pain",
    [
      "chronic pain management",
      "neuropathic pain",
      "gabapentin",
      "pregabalin",
      "chronic opioid",
      "pain clinic",
      "interventional pain",
      "spinal cord stimulation",
      "CRPS",
      "phantom pain",
      "כאב כרוני",
      "ניהול כאב כרוני",
      "נוירופתי",
      "גבפנטין",
      "פרגבלין",
    ],
  ],
  [
    "Acute Postoperative Pain",
    [
      "postoperative pain",
      "acute pain management",
      "PCA pump",
      "pain score VAS",
      "analgesic ladder",
      "multimodal analgesia",
      "postop opioid",
      "NSAIDs postop",
      "acetaminophen postop",
      "כאב פוסט-ניתוחי",
      "ניהול כאב אקוטי",
      "PCA",
    ],
  ],
  [
    "Clinical Research",
    [
      "statistics",
      "p-value",
      "confidence interval",
      "study design",
      "RCT",
      "randomized controlled",
      "sample size",
      "meta-analysis",
      "systematic review",
      "evidence-based medicine",
      "null hypothesis",
      "type I error",
      "type II error",
      "power study",
      "bias",
      "confounding",
      "סטטיסטיקה",
      "מחקר קליני",
      "ביטחון",
      "מחקר אקראי",
    ],
  ],
  [
    "Risk of Anesthesia",
    [
      "anesthetic risk",
      "mortality anesthesia",
      "perioperative complication",
      "anesthesia safety",
      "ASA physical status risk",
      "cardiac risk index",
      "Goldman index",
      "Lee index",
      "סיכון הרדמה",
      "תמותה הרדמה",
      "סיכון ניתוחי",
    ],
  ],
  [
    "Clinical Care in Extreme Environments: High Pressure, Immersion, Drowning",
    [
      "hyperbaric",
      "decompression sickness",
      "nitrogen narcosis",
      "diving medicine",
      "drowning",
      "immersion",
      "barotrauma",
      "high altitude",
      "altitude sickness",
      "קסונים",
      "צלילה",
      "טביעה",
      "לחץ גבוה",
    ],
  ],
  [
    "Intravenous Drug Delivery Systems",
    [
      "TCI",
      "target controlled infusion",
      "Schnider model",
      "Marsh model",
      "pharmacokinetic infusion",
      "TIVA pump",
      "infusion system",
      "plasma concentration TCI",
      "effect-site TCI",
      "TCI",
      "מערכת עירוי",
      "Schnider",
      "Marsh",
    ],
  ],
];

/**
 * Classify a question into one of the known topics using keyword scoring.
 * Returns the best matching topic string, or "" if no match (caller can skip or use fallback).
 */
function classifyTopic(q: string, a: string, b: string, c: string, d: string): string {
  const text = [q, a, b, c, d].join(" ").toLowerCase();

  let bestTopic = "";
  let bestScore = 0;

  for (const [topic, keywords] of TOPIC_RULES) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  // Require at least 1 keyword match; otherwise return empty (no guess)
  return bestScore >= 1 ? bestTopic : "";
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function normalizeAnswer(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const map: Record<string, string> = {
    א: "A",
    ב: "B",
    ג: "C",
    ד: "D",
    a: "A",
    b: "B",
    c: "C",
    d: "D",
    A: "A",
    B: "B",
    C: "C",
    D: "D",
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "D",
  };
  return map[trimmed] || trimmed.toUpperCase();
}

/** Strip Google Sheets error markers so they don't leak into DB */
function clean(val: string | undefined): string {
  if (!val) return "";
  const t = val.trim();
  if (/^#[A-Z/!?0]+[!?]?$/i.test(t)) return "";
  return t;
}

function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).substring(0, 6).toUpperCase();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller and verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: not an admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin;

    // ── Step 1: Fetch & parse CSV ─────────────────────────────────────────────
    const csvRes = await fetch(SHEET_URL);
    if (!csvRes.ok) throw new Error(`Failed to fetch CSV: ${csvRes.status}`);
    const csvText = await csvRes.text();

    const rawRows = parse(csvText, { skipFirstRow: true, columns: undefined });

    if (rawRows.length > 0) {
      console.log(`CSV headers (${Object.keys(rawRows[0]).length}):`, Object.keys(rawRows[0]).join(", "));
    }

    const rows: Record<string, string>[] = rawRows.map((row: Record<string, string | undefined>) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.trim().toLowerCase()] = (value || "").trim();
      }
      return normalized;
    });

    console.log(`Parsed ${rows.length} CSV rows`);

    // ── Step 2: Build question objects from CSV ────────────────────────────────
    const questions: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    const seenIds = new Set<string>();
    let skippedCount = 0;

    for (const row of rows) {
      const qText = row["question"] || row["questiontext"] || row["q"] || "";
      const correct = row["correct"] || row["correctanswer"] || row["ans"] || "";

      if (!qText.trim()) {
        skippedCount++;
        continue;
      }

      const normalizedCorrect = normalizeAnswer(correct);
      const finalCorrect = normalizedCorrect || correct.trim().toUpperCase();

      let id = row["serial_question_number#"] || row["serial"] || row["id"];
      if (!id || !String(id).trim()) id = hashId(qText);
      id = String(id).trim();

      if (seenIds.has(id)) {
        let suffix = 2;
        while (seenIds.has(id + "_" + suffix)) suffix++;
        id = id + "_" + suffix;
      }
      seenIds.add(id);

      const refId = clean(row["questionid"] || row["question_id"] || row["ref_id"]);
      const institution = clean(row["institution"] || row["source"]) || "N/A";

      const rawTopic = clean(row["topic_main"] || row["topic"] || row["main topic"]);
      const optA = clean(row["optiona"] || row["a"] || row["option a"]);
      const optB = clean(row["optionb"] || row["b"] || row["option b"]);
      const optC = clean(row["optionc"] || row["c"] || row["option c"]);
      const optD = clean(row["optiond"] || row["d"] || row["option d"]);

      // If topic is missing from Sheet, try to classify by content
      const finalTopic = rawTopic || classifyTopic(qText, optA, optB, optC, optD);

      questions.push({
        id,
        ref_id: refId || "N/A",
        question: qText,
        a: optA,
        b: optB,
        c: optC,
        d: optD,
        correct: finalCorrect || "",
        explanation: clean(row["explanation"] || row["explanation_correct"]),
        topic: finalTopic,
        year: clean(row["year"]),
        source: institution,
        kind: clean(row["kind"] || row["type"]),
        miller: clean(row["miller"] || row["miller page"]) || "N/A",
        chapter: parseInt(clean(row["chapter"] || row["topic num"]) || "0") || 0,
        media_type: clean(row["mediakind"] || row["media type"]).toLowerCase(),
        media_link: clean(row["medialink"] || row["media link"]),
        synced_at: now,
      });
    }

    console.log(`Produced ${questions.length} questions, skipped ${skippedCount} empty rows`);

    if (questions.length === 0) {
      return new Response(JSON.stringify({ error: "No valid questions found in CSV" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Get manually_edited IDs to skip ───────────────────────────────
    const { data: editedRows } = await supabase.from("questions").select("id").eq("manually_edited", true);
    const editedIds = new Set((editedRows || []).map((r: { id: string }) => r.id));
    console.log(`Skipping ${editedIds.size} manually edited questions`);

    // ── Step 4: Upsert non-protected questions from Sheet ─────────────────────
    const toUpsert = questions.filter((q: any) => !editedIds.has(q.id));
    let upserted = 0;
    const batchSize = 200;

    for (let i = 0; i < toUpsert.length; i += batchSize) {
      const batch = toUpsert.slice(i, i + batchSize);
      const { error } = await supabase.from("questions").upsert(batch, { onConflict: "id" });
      if (error) {
        console.error("Upsert error:", error);
        throw new Error(`Upsert failed: ${error.message}`);
      }
      upserted += batch.length;
    }

    console.log(`Upserted ${upserted} questions from Sheet`);

    // ── Step 5: Self-healing pass — classify all empty-topic questions in DB ──
    // Fetch in batches of 500 (anon limit not relevant here; service role)
    let classified = 0;
    let from = 0;
    const PAGE = 500;

    while (true) {
      const { data: unclassified, error: fetchErr } = await supabase
        .from("questions")
        .select("id, question, a, b, c, d")
        .or("topic.eq.,topic.is.null")
        .range(from, from + PAGE - 1);

      if (fetchErr) {
        console.error("Fetch unclassified error:", fetchErr);
        break;
      }
      if (!unclassified || unclassified.length === 0) break;

      // Classify each and batch-update
      const updates: { id: string; topic: string }[] = [];
      for (const q of unclassified) {
        const topic = classifyTopic(q.question || "", q.a || "", q.b || "", q.c || "", q.d || "");
        if (topic) updates.push({ id: q.id, topic });
      }

      if (updates.length > 0) {
        // Update in sub-batches of 100
        for (let i = 0; i < updates.length; i += 100) {
          const sub = updates.slice(i, i + 100);
          const ids = sub.map((u) => u.id);

          // Build CASE WHEN for bulk topic update
          // Supabase JS doesn't support bulk conditional updates natively,
          // so update each individually (still fast in batches)
          for (const { id, topic } of sub) {
            const { error: upErr } = await supabase
              .from("questions")
              .update({ topic, manually_edited: true })
              .eq("id", id);
            if (upErr) console.error(`Update error for ${id}:`, upErr);
            else classified++;
          }
        }
      }

      // For any that still have empty topic after classification (no keyword match),
      // mark them manually_edited=true with empty topic to prevent repeated processing
      const unresolved = unclassified.filter((q: any) => !updates.find((u) => u.id === q.id));
      if (unresolved.length > 0) {
        for (const q of unresolved) {
          await supabase.from("questions").update({ manually_edited: true }).eq("id", q.id);
        }
        console.log(`Marked ${unresolved.length} questions as manually_edited (no topic match)`);
      }

      if (unclassified.length < PAGE) break;
      from += PAGE;
    }

    console.log(`Self-healing pass: classified ${classified} previously unclassified questions`);

    return new Response(JSON.stringify({ success: true, count: upserted, classified, synced_at: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("Sync error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
// v2
