/**
 * Snapshot of valid topic names in the `questions` table (Supabase).
 *
 * Source of truth for tests that validate hardcoded topic-name maps in
 * `src/lib/smartSelection.ts` (YIELD_TIER_MAP, SIMULATION_PROPORTIONS).
 *
 * IMPORTANT — re-snapshot whenever the DB topic list changes:
 *   SELECT topic, COUNT(*) FROM questions
 *   WHERE topic IS NOT NULL AND topic <> '' AND topic <> '#N/A'
 *   GROUP BY topic ORDER BY topic;
 *
 * Last synced: 2026-04-27 (78 distinct topics, excluding '#N/A' garbage row).
 *
 * Note: 3 topic names contain en-dash (U+2013, '–') NOT regular hyphen:
 *   - 'Perioperative Acid–Base Balance'
 *   - 'Anesthesia for Otolaryngologic and Head–Neck Surgery'
 *   - 'Non–Operating Room Anesthesia'
 *
 * Note: One row has curly apostrophe typo ('Brain’s' vs 'Brain\'s') —
 *   included for snapshot fidelity but the canonical version uses ASCII apostrophe.
 */
export const DB_TOPICS: readonly string[] = [
  'ACLS',
  'Acute Postoperative Pain',
  'Airway Management in the Adult',
  'Ambulatory (Outpatient) Anesthesia',
  'Anesthesia and the Renal and Genitourinary Systems',
  'Anesthesia for Abdominal Organ Transplantation',
  'Anesthesia for Bariatric Surgery',
  'Anesthesia for Cardiac Surgical Procedures',
  'Anesthesia for Correction of Cardiac Arrhythmias',
  'Anesthesia for Fetal Surgery and Other Fetal Therapies',
  'Anesthesia for Neurologic Surgery and Neurointerventions',
  'Anesthesia for Obstetrics',
  'Anesthesia for Ophthalmic Surgery',
  'Anesthesia for Organ Procurement',
  'Anesthesia for Orthopedic Surgery',
  'Anesthesia for Otolaryngologic and Head–Neck Surgery',
  'Anesthesia for Pediatric Cardiac Surgery',
  'Anesthesia for Robotic Surgery',
  'Anesthesia for Thoracic Surgery',
  'Anesthesia for Trauma',
  'Anesthesia for Vascular Surgery',
  'Anesthetic Implications of Concurrent Diseases',
  'Basic Principles of Pharmacology',
  'Burn Management',
  'Cardiac Physiology',
  'Cardiopulmonary Resuscitation and Advanced Cardiac Life Support',
  'Cardiovascular Monitoring',
  'Cerebral Physiology and the Effects of Anesthetic Drugs',
  'Clinical Care in Extreme Environments: High Pressure, Immersion, Drowning, Hypo-, and Hyperthermia',
  'Clinical Care in Extreme Environments: Physiology at High Altitude and in Space',
  'Clinical Research',
  'Consciousness, Memory, and Anesthesia',
  'Critical Care Anesthesiology',
  'Extracorporeal Membrane Oxygenation and Cardiac Devices',
  'Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations',
  'Geriatric Anesthesia',
  'Immune Implications of Anesthesia Care and Practice',
  'Implantable Cardiac Pulse Generators: Pacemakers and Cardioverter-Defibrillators',
  'Inhaled Anesthetic Delivery Systems',
  'Inhaled Anesthetic Uptake, Distribution, Metabolism and Toxicity',
  'Inhaled Anesthetics: Mechanisms of Action',
  'Interpreting the Medical Literature',
  'Intravenous Anesthetics',
  'Intravenous Drug Delivery Systems',
  'Local Anesthetics',
  'Management of the Patient with Chronic Pain',
  'Monitoring the Brain\'s Response to Anesthesia and Surgery',
  'Monitoring the Brain’s Response to Anesthesia and Surgery',
  'Neurocritical Care',
  'Neuromuscular Disorders and Other Genetic Disorders',
  'Neuromuscular Monitoring',
  'Neuromuscular Physiology and Pharmacology',
  'Neurophysiologic Monitoring',
  'Non–Operating Room Anesthesia',
  'Opioids',
  'Patient Blood Management: Coagulation',
  'Patient Blood Management: Transfusion Therapy',
  'Patient Positioning and Associated Risks',
  'Pediatric and Neonatal Critical Care',
  'Pediatric Anesthesia',
  'Perioperative Acid–Base Balance',
  'Perioperative Echocardiography and Point-of-Care Ultrasound (POCUS)',
  'Perioperative Fluid and Electrolyte Therapy',
  'Perioperative Neurocognitive Disorders',
  'Peripheral Nerve Blocks and Ultrasound Guidance for Regional Anesthesia',
  'Pharmacology of Neuromuscular Blocking Drugs and Antagonists (Reversal Agents)',
  'Prehospital Care for Medical Emergencies and Trauma',
  'Preoperative Evaluation',
  'Pulmonary Pharmacology of Inhaled Anesthetics',
  'Regional Anesthesia in Children',
  'Renal Anatomy, Physiology, Pharmacology, and Evaluation of Function',
  'Renal Pathophysiology and Treatment for Perioperative Ischemia and Nephrotoxic Injury',
  'Respiratory Monitoring',
  'Respiratory Physiology and Pathophysiology',
  'Risk of Anesthesia',
  'Sleep Medicine',
  'Spinal, Epidural, and Caudal Anesthesia',
  'The Postanesthesia Care Unit',
] as const;

export const DB_TOPICS_SET: ReadonlySet<string> = new Set(DB_TOPICS);
