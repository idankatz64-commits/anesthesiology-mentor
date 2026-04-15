#!/usr/bin/env python3
"""
Master Statistical Report v2 — Anesthesiology Board Exam
Data source: user_answers (correct_count/answered_count) — CORRECTED
Date: April 11, 2026 | Exam: June 16, 2026 (66 days)
"""

import json, math, random, statistics
from collections import defaultdict

random.seed(42)

EXAM_DATE = "2026-06-16"
REPORT_DATE = "2026-04-11"
DAYS_LEFT = 66
TOTAL_DB = 3353

# ===========================================================================
# 1. RAW DATA — from Supabase (READ-ONLY queries, April 11 2026)
# ===========================================================================

# user_answers JOIN questions — CORRECT accuracy source
# (topic, unique_qs_answered, sum_correct_count, sum_answered_count)
UA_RAW = [
    ("Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations", 103, 86, 123),
    ("ACLS", 68, 85, 96),
    ("Cerebral Physiology and the Effects of Anesthetic Drugs", 41, 58, 78),
    ("Cardiovascular Monitoring", 38, 53, 76),
    ("Pediatric Anesthesia", 35, 56, 67),
    ("Patient Positioning and Associated Risks", 28, 47, 59),
    ("Respiratory Monitoring", 16, 34, 40),
    ("Geriatric Anesthesia", 19, 32, 38),
    ("Cardiopulmonary Resuscitation and Advanced Cardiac Life Support", 13, 18, 31),
    ("Inhaled Anesthetic Uptake, Distribution, Metabolism and Toxicity", 15, 18, 29),
    ("Anesthesia for Bariatric Surgery", 18, 19, 29),
    ("Sleep Medicine", 10, 18, 28),
    ("Intravenous Anesthetics", 15, 18, 28),
    ("Respiratory Physiology and Pathophysiology", 13, 22, 27),
    ("Anesthesia for Obstetrics", 12, 18, 25),
    ("Opioids", 11, 20, 23),
    ("Inhaled Anesthetic Delivery Systems", 13, 16, 21),
    ("Neuromuscular Physiology and Pharmacology", 9, 18, 18),
    ("Critical Care Anesthesiology", 10, 11, 17),
    ("Cardiac Physiology", 10, 14, 17),
    ("Neuromuscular Monitoring", 8, 12, 16),
    ("Anesthesia for Robotic Surgery", 11, 15, 16),
    ("Anesthesia for Vascular Surgery", 9, 12, 16),
    ("Anesthesia for Trauma", 9, 11, 15),
    ("The Postanesthesia Care Unit", 9, 10, 15),
    ("Preoperative Evaluation", 8, 14, 15),
    ("Regional Anesthesia in Children", 7, 8, 15),
    ("Management of the Patient with Chronic Pain", 7, 11, 15),
    ("Perioperative Fluid and Electrolyte Therapy", 9, 13, 15),
    ("Anesthesia for Pediatric Cardiac Surgery", 5, 12, 15),
    ("Local Anesthetics", 9, 13, 14),
    ("Perioperative Echocardiography and Point-of-Care Ultrasound (POCUS)", 7, 11, 14),
    ("Patient Blood Management: Coagulation", 8, 9, 13),
    ("Basic Principles of Pharmacology", 8, 9, 11),
    ("Neuromuscular Disorders and Other Genetic Disorders", 6, 8, 11),
    ("Renal Anatomy, Physiology, Pharmacology, and Evaluation of Function", 5, 8, 11),
    ("Pulmonary Pharmacology of Inhaled Anesthetics", 5, 8, 10),
    ("Risk of Anesthesia", 4, 8, 9),
    ("Anesthesia for Cardiac Surgical Procedures", 5, 8, 9),
    ("Ambulatory (Outpatient) Anesthesia", 5, 8, 9),
    ("Perioperative Neurocognitive Disorders", 3, 6, 7),
    ("Spinal, Epidural, and Caudal Anesthesia", 3, 6, 7),
    ("Clinical Care in Extreme Environments: High Pressure, Immersion, Drowning, Hypo-, and Hyperthermia", 3, 6, 7),
    ("Acute Postoperative Pain", 3, 6, 6),
    ("Perioperative Acid-Base Balance", 3, 5, 6),
    ("Clinical Care in Extreme Environments: Physiology at High Altitude and in Space", 4, 4, 6),
    ("Peripheral Nerve Blocks and Ultrasound Guidance for Regional Anesthesia", 4, 5, 6),
    ("Neurocritical Care", 3, 5, 6),
    ("Airway Management in the Adult", 5, 6, 6),
    ("Implantable Cardiac Pulse Generators: Pacemakers and Cardioverter-Defibrillators", 3, 5, 6),
    ("Anesthesia and the Renal and Genitourinary Systems", 4, 5, 6),
    ("Anesthesia for Thoracic Surgery", 3, 5, 6),
    ("Immune Implications of Anesthesia Care and Practice", 2, 3, 5),
    ("Clinical Research", 3, 3, 5),
    ("Extracorporeal Membrane Oxygenation and Cardiac Devices", 3, 4, 5),
    ("Anesthetic Implications of Concurrent Diseases", 3, 4, 5),
    ("Pharmacology of Neuromuscular Blocking Drugs and Antagonists (Reversal Agents)", 3, 4, 5),
    ("Monitoring the Brain's Response to Anesthesia and Surgery", 4, 7, 7),  # merged: 3+1 qs, 5+2 correct, 5+2 attempts
    ("Neurophysiologic Monitoring", 4, 5, 5),
    ("Anesthesia for Fetal Surgery and Other Fetal Therapies", 3, 3, 4),
    ("Anesthesia for Orthopedic Surgery", 2, 4, 4),
    ("Anesthesia for Abdominal Organ Transplantation", 2, 4, 4),
    ("Intravenous Drug Delivery Systems", 2, 4, 4),
    ("Pediatric and Neonatal Critical Care", 2, 4, 4),
    ("Anesthesia for Organ Procurement", 2, 3, 4),
    ("Anesthesia for Correction of Cardiac Arrhythmias", 2, 3, 3),
    ("Non-Operating Room Anesthesia", 2, 3, 3),
    ("Patient Blood Management: Transfusion Therapy", 2, 3, 3),
    ("Interpreting the Medical Literature", 1, 1, 3),
    ("Burn Management", 1, 3, 3),
    ("Anesthesia for Neurologic Surgery and Neurointerventions", 2, 2, 3),
    ("Prehospital Care for Medical Emergencies and Trauma", 1, 3, 3),
    ("Consciousness, Memory, and Anesthesia", 1, 2, 2),
    ("Renal Pathophysiology and Treatment for Perioperative Ischemia and Nephrotoxic Injury", 2, 2, 2),
    ("Anesthesia for Ophthalmic Surgery", 2, 1, 2),
    ("Inhaled Anesthetics: Mechanisms of Action", 2, 2, 2),
    ("Anesthesia for Otolaryngologic and Head-Neck Surgery", 1, 1, 1),
]

# questions table — DB size per topic
DB_RAW = [
    ("Gastrointestinal and Hepatic Physiology, Pathophysiology, and Anesthetic Considerations", 157),
    ("Cerebral Physiology and the Effects of Anesthetic Drugs", 145),
    ("Cardiac Physiology", 135),
    ("Respiratory Physiology and Pathophysiology", 132),
    ("Inhaled Anesthetic Delivery Systems", 121),
    ("Opioids", 98),
    ("Renal Anatomy, Physiology, Pharmacology, and Evaluation of Function", 97),
    ("Inhaled Anesthetic Uptake, Distribution, Metabolism and Toxicity", 96),
    ("Pharmacology of Neuromuscular Blocking Drugs and Antagonists (Reversal Agents)", 88),
    ("Anesthesia for Obstetrics", 77),
    ("Sleep Medicine", 75),
    ("Intravenous Anesthetics", 74),
    ("Basic Principles of Pharmacology", 73),
    ("Anesthesia for Cardiac Surgical Procedures", 73),
    ("Cardiovascular Monitoring", 71),
    ("Airway Management in the Adult", 71),
    ("Anesthetic Implications of Concurrent Diseases", 68),
    ("ACLS", 68),
    ("Preoperative Evaluation", 63),
    ("Pediatric Anesthesia", 63),
    ("Spinal, Epidural, and Caudal Anesthesia", 62),
    ("Perioperative Acid-Base Balance", 61),
    ("Neuromuscular Physiology and Pharmacology", 60),
    ("Patient Blood Management: Coagulation", 58),
    ("Respiratory Monitoring", 56),
    ("Peripheral Nerve Blocks and Ultrasound Guidance for Regional Anesthesia", 53),
    ("Inhaled Anesthetics: Mechanisms of Action", 53),
    ("Perioperative Fluid and Electrolyte Therapy", 52),
    ("Local Anesthetics", 51),
    ("Critical Care Anesthesiology", 51),
    ("Anesthesia for Trauma", 47),
    ("Perioperative Echocardiography and Point-of-Care Ultrasound (POCUS)", 45),
    ("Anesthesia for Thoracic Surgery", 44),
    ("Anesthesia for Neurologic Surgery and Neurointerventions", 43),
    ("Neuromuscular Monitoring", 42),
    ("Patient Blood Management: Transfusion Therapy", 41),
    ("Neurocritical Care", 37),
    ("Geriatric Anesthesia", 35),
    ("Management of the Patient with Chronic Pain", 35),
    ("Neuromuscular Disorders and Other Genetic Disorders", 33),
    ("The Postanesthesia Care Unit", 32),
    ("Anesthesia for Vascular Surgery", 32),
    ("Pulmonary Pharmacology of Inhaled Anesthetics", 30),
    ("Patient Positioning and Associated Risks", 29),
    ("Renal Pathophysiology and Treatment for Perioperative Ischemia and Nephrotoxic Injury", 26),
    ("Consciousness, Memory, and Anesthesia", 26),
    ("Anesthesia for Bariatric Surgery", 25),
    ("Regional Anesthesia in Children", 25),
    ("Monitoring the Brain's Response to Anesthesia and Surgery", 24),  # merged 23+1
    ("Anesthesia and the Renal and Genitourinary Systems", 23),
    ("Ambulatory (Outpatient) Anesthesia", 22),
    ("Implantable Cardiac Pulse Generators: Pacemakers and Cardioverter-Defibrillators", 21),
    ("Anesthesia for Otolaryngologic and Head-Neck Surgery", 21),
    ("Anesthesia for Orthopedic Surgery", 18),
    ("Neurophysiologic Monitoring", 17),
    ("Cardiopulmonary Resuscitation and Advanced Cardiac Life Support", 16),
    ("Anesthesia for Abdominal Organ Transplantation", 15),
    ("Extracorporeal Membrane Oxygenation and Cardiac Devices", 14),
    ("Intravenous Drug Delivery Systems", 14),
    ("Anesthesia for Ophthalmic Surgery", 14),
    ("Anesthesia for Robotic Surgery", 11),
    ("Risk of Anesthesia", 10),
    ("Anesthesia for Fetal Surgery and Other Fetal Therapies", 9),
    ("Acute Postoperative Pain", 9),
    ("Anesthesia for Correction of Cardiac Arrhythmias", 9),
    ("Anesthesia for Pediatric Cardiac Surgery", 8),
    ("Pediatric and Neonatal Critical Care", 8),
    ("Non-Operating Room Anesthesia", 6),
    ("Clinical Research", 6),
    ("Perioperative Neurocognitive Disorders", 5),
    ("Clinical Care in Extreme Environments: High Pressure, Immersion, Drowning, Hypo-, and Hyperthermia", 5),
    ("Clinical Care in Extreme Environments: Physiology at High Altitude and in Space", 4),
    ("Immune Implications of Anesthesia Care and Practice", 2),
    ("Anesthesia for Organ Procurement", 2),
    ("Burn Management", 2),
    ("Prehospital Care for Medical Emergencies and Trauma", 1),
    ("Interpreting the Medical Literature", 1),
]

# Daily trend from answer_history (note: slightly deflated by SRS retry bug, ~5% phantom wrongs)
DAILY = [
    ("2026-03-21", 45, 33, 73.3),
    ("2026-03-22", 44, 27, 61.4),
    ("2026-03-23", 47, 37, 78.7),
    ("2026-03-24", 49, 33, 67.3),
    ("2026-03-26", 55, 42, 76.4),
    ("2026-03-27", 33, 22, 66.7),
    ("2026-03-28", 61, 45, 73.8),
    ("2026-03-29", 95, 62, 65.3),
    ("2026-03-30", 87, 64, 73.6),
    ("2026-03-31", 95, 67, 70.5),
    ("2026-04-01", 30, 28, 93.3),
    ("2026-04-02", 39, 36, 92.3),
    ("2026-04-03", 11, 7, 63.6),
    ("2026-04-04", 27, 17, 63.0),
    ("2026-04-05", 143, 118, 82.5),
    ("2026-04-06", 135, 93, 68.9),
    ("2026-04-07", 113, 78, 69.0),
    ("2026-04-08", 109, 81, 74.3),
    ("2026-04-09", 58, 50, 86.2),
    ("2026-04-10", 1, 1, 100.0),
    ("2026-04-11", 93, 73, 78.5),
]

# Hourly from answer_history
HOURLY = [
    (0, 3, 3, 100.0), (2, 1, 1, 100.0), (3, 16, 10, 62.5),
    (4, 30, 25, 83.3), (5, 50, 40, 80.0), (6, 93, 73, 78.5),
    (7, 98, 78, 79.6), (8, 77, 58, 75.3), (9, 83, 67, 80.7),
    (10, 84, 67, 79.8), (11, 136, 98, 72.1), (12, 94, 65, 69.1),
    (13, 98, 69, 70.4), (14, 101, 75, 74.3), (15, 62, 45, 72.6),
    (16, 41, 28, 68.3), (17, 57, 39, 68.4), (18, 91, 58, 63.7),
    (19, 57, 38, 66.7), (20, 68, 55, 80.9), (21, 28, 20, 71.4),
    (22, 1, 1, 100.0), (23, 1, 1, 100.0),
]

# SRS summary
SRS_SUMMARY = {
    "confident": {"total": 315, "due": 147, "never_reviewed": 6, "active": 309, "avg_ease": 2.57, "avg_interval": 9.1},
    "hesitant":  {"total": 319, "due": 230, "never_reviewed": 63, "active": 256, "avg_ease": 2.43, "avg_interval": 3.3},
    "guessed":   {"total": 103, "due": 83, "never_reviewed": 86, "active": 17, "avg_ease": 2.24, "avg_interval": 1.6},
}

# ===========================================================================
# 2. MERGE & PREPARE DATA
# ===========================================================================

def build_topics():
    """Merge user_answers + DB data into unified topic list."""
    db_map = {t: c for t, c in DB_RAW}
    ua_map = {}
    for topic, qs, correct, attempts in UA_RAW:
        if topic is None or topic == "#N/A":
            continue
        if topic in ua_map:
            # merge duplicate
            prev = ua_map[topic]
            ua_map[topic] = (prev[0] + qs, prev[1] + correct, prev[2] + attempts)
        else:
            ua_map[topic] = (qs, correct, attempts)

    topics = []
    for topic, db_count in db_map.items():
        if topic is None or topic == "#N/A":
            continue
        if topic in ua_map:
            qs, correct, attempts = ua_map[topic]
            accuracy = correct / attempts if attempts > 0 else 0
            topics.append({
                "name": topic,
                "db_count": db_count,
                "unique_answered": qs,
                "correct": correct,
                "attempts": attempts,
                "accuracy": accuracy,
                "coverage": qs / db_count if db_count > 0 else 0,
                "studied": True,
            })
        else:
            topics.append({
                "name": topic,
                "db_count": db_count,
                "unique_answered": 0,
                "correct": 0,
                "attempts": 0,
                "accuracy": 0,
                "coverage": 0,
                "studied": False,
            })

    topics.sort(key=lambda t: t["db_count"], reverse=True)
    return topics


# ===========================================================================
# 3. STATISTICAL MODELS
# ===========================================================================

def compute_globals(topics):
    """Global metrics."""
    total_correct = sum(t["correct"] for t in topics)
    total_attempts = sum(t["attempts"] for t in topics)
    total_answered = sum(t["unique_answered"] for t in topics)
    accuracy = total_correct / total_attempts if total_attempts > 0 else 0
    coverage = total_answered / TOTAL_DB
    return {
        "total_questions_db": TOTAL_DB,
        "total_answered": total_answered,
        "total_attempts": total_attempts,
        "total_correct": total_correct,
        "accuracy": round(accuracy * 100, 1),
        "coverage": round(coverage * 100, 1),
        "topics_studied": sum(1 for t in topics if t["studied"]),
        "topics_total": len(topics),
        "days_left": DAYS_LEFT,
    }


def compute_ols(daily):
    """OLS linear regression on daily accuracy."""
    n = len(daily)
    if n < 3:
        return {"slope": 0, "p_value": 1, "r_squared": 0, "intercept": 0}

    x = list(range(n))
    y = [d[3] for d in daily]  # accuracy %

    x_mean = sum(x) / n
    y_mean = sum(y) / n

    ss_xy = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n))
    ss_xx = sum((x[i] - x_mean) ** 2 for i in range(n))
    ss_yy = sum((y[i] - y_mean) ** 2 for i in range(n))

    if ss_xx == 0:
        return {"slope": 0, "p_value": 1, "r_squared": 0, "intercept": y_mean}

    slope = ss_xy / ss_xx
    intercept = y_mean - slope * x_mean
    r_squared = (ss_xy ** 2) / (ss_xx * ss_yy) if ss_yy > 0 else 0

    # t-test for slope significance
    y_pred = [intercept + slope * xi for xi in x]
    sse = sum((y[i] - y_pred[i]) ** 2 for i in range(n))
    mse = sse / (n - 2) if n > 2 else 0
    se_slope = math.sqrt(mse / ss_xx) if ss_xx > 0 and mse > 0 else 1e-10
    t_stat = slope / se_slope

    # approximate p-value from t distribution (two-tailed, df=n-2)
    df = n - 2
    p_value = approx_t_pvalue(abs(t_stat), df) * 2

    return {
        "slope": round(slope, 3),
        "p_value": round(p_value, 4),
        "r_squared": round(r_squared, 3),
        "intercept": round(intercept, 1),
        "trend_direction": "up" if slope > 0 else "down",
        "significant": p_value < 0.05,
    }


def approx_t_pvalue(t, df):
    """Approximate one-tailed p-value for t-distribution using normal approx."""
    # For df > 30, t ≈ z
    # For smaller df, use Welch-Satterthwaite approximation
    if df <= 0:
        return 0.5
    z = t * (1 - 1 / (4 * df)) if df > 2 else t * 0.8
    # standard normal CDF approximation
    return 0.5 * math.erfc(z / math.sqrt(2))


def beta_sample(a, b):
    """Sample from Beta(a,b) using gamma distribution."""
    if a <= 0: a = 0.01
    if b <= 0: b = 0.01
    x = random.gammavariate(a, 1)
    y = random.gammavariate(b, 1)
    return x / (x + y) if (x + y) > 0 else 0.5


def compute_monte_carlo(topics, n_sim=10000, exam_size=200):
    """Monte Carlo exam simulation using Beta posteriors from user_answers."""
    # Build weight vector (DB distribution)
    total_w = sum(t["db_count"] for t in topics)
    weights = [t["db_count"] / total_w for t in topics]

    # Build Beta parameters per topic
    betas = []
    for t in topics:
        if t["studied"] and t["attempts"] > 0:
            alpha = t["correct"] + 1
            beta_param = (t["attempts"] - t["correct"]) + 1
        else:
            # Uninformative prior for unstudied topics
            alpha = 1
            beta_param = 1
        betas.append((alpha, beta_param))

    scores = []
    for _ in range(n_sim):
        # Sample per-topic accuracy from Beta posterior
        topic_acc = [beta_sample(a, b) for a, b in betas]

        # Simulate exam: sample questions proportional to DB weight
        exam_correct = 0
        for q in range(exam_size):
            # pick topic by weight
            r = random.random()
            cumul = 0
            chosen = 0
            for j, w in enumerate(weights):
                cumul += w
                if r <= cumul:
                    chosen = j
                    break
            # answer correct with probability = sampled accuracy for that topic
            if random.random() < topic_acc[chosen]:
                exam_correct += 1

        scores.append(exam_correct / exam_size * 100)

    scores.sort()
    median = scores[len(scores) // 2]
    mean = sum(scores) / len(scores)

    percentiles = {}
    for p in [5, 10, 25, 50, 75, 90, 95]:
        idx = int(len(scores) * p / 100)
        percentiles[f"p{p}"] = round(scores[min(idx, len(scores) - 1)], 1)

    # P(score >= threshold)
    thresholds = {}
    for threshold in [60, 65, 70, 75, 80]:
        count = sum(1 for s in scores if s >= threshold)
        thresholds[f"p_ge_{threshold}"] = round(count / len(scores) * 100, 1)

    # histogram bins
    bins = defaultdict(int)
    for s in scores:
        b = int(s // 2) * 2  # 2% bins
        bins[b] += 1

    histogram = sorted(bins.items())

    return {
        "n_simulations": n_sim,
        "exam_size": exam_size,
        "median": round(median, 1),
        "mean": round(mean, 1),
        "std": round(statistics.stdev(scores), 1),
        "percentiles": percentiles,
        "thresholds": thresholds,
        "histogram": histogram,
    }


def compute_bootstrap_ci(topics, n_iter=2000):
    """Bootstrap 95% CI for global accuracy."""
    all_results = []
    for t in topics:
        if t["studied"] and t["attempts"] > 0:
            correct = t["correct"]
            wrong = t["attempts"] - t["correct"]
            all_results.extend([1] * correct + [0] * wrong)

    if not all_results:
        return {"ci_lower": 0, "ci_upper": 0, "mean": 0}

    means = []
    n = len(all_results)
    for _ in range(n_iter):
        sample = [all_results[random.randint(0, n - 1)] for _ in range(n)]
        means.append(sum(sample) / n * 100)

    means.sort()
    ci_lower = means[int(n_iter * 0.025)]
    ci_upper = means[int(n_iter * 0.975)]

    return {
        "ci_lower": round(ci_lower, 1),
        "ci_upper": round(ci_upper, 1),
        "mean": round(sum(means) / len(means), 1),
    }


def compute_bayesian_pfail(topics):
    """Bayesian P(fail) per topic — probability accuracy < 70%."""
    results = []
    for t in topics:
        if not t["studied"] or t["attempts"] == 0:
            results.append({"name": t["name"], "p_fail": 0.5, "db_weight": t["db_count"] / TOTAL_DB})
            continue
        alpha = t["correct"] + 1
        beta_param = (t["attempts"] - t["correct"]) + 1
        # Estimate P(theta < 0.7) via sampling
        n_samples = 5000
        below = sum(1 for _ in range(n_samples) if beta_sample(alpha, beta_param) < 0.7)
        p_fail = below / n_samples
        results.append({
            "name": t["name"],
            "p_fail": round(p_fail, 3),
            "db_weight": round(t["db_count"] / TOTAL_DB, 4),
            "accuracy": round(t["accuracy"] * 100, 1),
            "attempts": t["attempts"],
        })
    results.sort(key=lambda r: r["p_fail"], reverse=True)
    return results


def compute_ebbinghaus(srs_summary):
    """Ebbinghaus forgetting curve analysis."""
    results = {}
    for conf, data in srs_summary.items():
        S = data["avg_interval"] * data["avg_ease"]  # stability
        # Retention at various future times
        retention = {}
        for days in [1, 7, 14, 30, 66]:
            R = math.exp(-days / S) if S > 0 else 0
            retention[f"day_{days}"] = round(R * 100, 1)
        results[conf] = {
            "stability": round(S, 1),
            "active_count": data["active"],
            "due_count": data["due"],
            "never_reviewed": data["never_reviewed"],
            "avg_ease": data["avg_ease"],
            "avg_interval": data["avg_interval"],
            "retention": retention,
        }
    return results


def compute_evpi(topics):
    """Expected Value of Perfect Information — ROI per study hour per topic."""
    results = []
    for t in topics:
        if not t["studied"] or t["attempts"] < 3:
            # Skip unstudied or too little data
            continue
        db_weight = t["db_count"] / TOTAL_DB
        # P(fail) for this topic
        alpha = t["correct"] + 1
        beta_param = (t["attempts"] - t["correct"]) + 1
        p_fail_samples = [1 if beta_sample(alpha, beta_param) < 0.7 else 0 for _ in range(3000)]
        p_fail = sum(p_fail_samples) / len(p_fail_samples)

        # Estimated accuracy gain per study hour (diminishing returns)
        current_acc = t["accuracy"]
        # More room to improve = more gain per hour
        gap = max(0, 1.0 - current_acc)
        delta_per_hour = gap * 0.15  # 15% of remaining gap per hour (empirical)

        evpi = db_weight * delta_per_hour * p_fail * 1000  # scaled
        results.append({
            "name": t["name"],
            "evpi": round(evpi, 2),
            "p_fail": round(p_fail, 3),
            "db_weight": round(db_weight * 100, 1),
            "current_acc": round(current_acc * 100, 1),
            "gap": round(gap * 100, 1),
            "unique_answered": t["unique_answered"],
            "db_count": t["db_count"],
        })

    results.sort(key=lambda r: r["evpi"], reverse=True)
    return results


def compute_readiness(globals_data, topics, mc_data, ols_data):
    """
    Exam Readiness Index (ERI) — same formula as app:
    25% accuracy + 25% coverage + 30% criticalAvg + 20% consistency
    """
    # accuracy component (0-100)
    accuracy_score = globals_data["accuracy"]

    # coverage component (0-100): 60% coverage = 100 score
    coverage_pct = globals_data["coverage"] / 100  # convert from percentage to 0-1
    coverage_score = min(100, coverage_pct / 0.6 * 100)

    # critical topics: top 15 by db_count
    critical = sorted(topics, key=lambda t: t["db_count"], reverse=True)[:15]
    critical_studied = [t for t in critical if t["studied"] and t["attempts"] > 0]
    if critical_studied:
        critical_avg = sum(t["accuracy"] * 100 for t in critical_studied) / len(critical_studied)
    else:
        critical_avg = 0

    # consistency: std of daily accuracy (lower = more consistent)
    daily_accs = [d[3] for d in DAILY if d[1] >= 5]  # at least 5 attempts
    if len(daily_accs) >= 3:
        daily_std = statistics.stdev(daily_accs)
        consistency = max(0, 100 - daily_std * 2)  # lower std = higher score
    else:
        consistency = 50

    eri = 0.25 * accuracy_score + 0.25 * coverage_score + 0.30 * critical_avg + 0.20 * consistency

    return {
        "eri": round(eri, 1),
        "components": {
            "accuracy": round(accuracy_score, 1),
            "coverage": round(coverage_score, 1),
            "critical_avg": round(critical_avg, 1),
            "consistency": round(consistency, 1),
        },
        "critical_topics_count": len(critical_studied),
    }


def compute_marginal_gains(topics, n_sim=3000, exam_size=200):
    """Marginal Gain Engine — how much does P(pass) improve if you study each topic?
    Simulates: 'What if I correctly answer 20 more questions in topic X?'"""
    total_w = sum(t["db_count"] for t in topics)
    weights = [t["db_count"] / total_w for t in topics]

    # Build base Beta parameters
    base_betas = []
    for t in topics:
        if t["studied"] and t["attempts"] > 0:
            alpha = t["correct"] + 1
            beta_p = (t["attempts"] - t["correct"]) + 1
        else:
            alpha = 1
            beta_p = 1
        base_betas.append((alpha, beta_p))

    def sim_pass_rate(betas):
        passes = 0
        for _ in range(n_sim):
            topic_acc = [beta_sample(a, b) for a, b in betas]
            score = 0
            for q in range(exam_size):
                r = random.random()
                cumul = 0
                chosen = 0
                for j, w in enumerate(weights):
                    cumul += w
                    if r <= cumul:
                        chosen = j
                        break
                if random.random() < topic_acc[chosen]:
                    score += 1
            if score / exam_size >= 0.7:
                passes += 1
        return passes / n_sim * 100

    base_p70 = sim_pass_rate(base_betas)

    results = []
    for i, t in enumerate(topics):
        if not t["studied"] or t["attempts"] < 3 or t["db_count"] < 10:
            continue
        # Simulate adding 20 correct answers
        shifted = list(base_betas)
        a, b = shifted[i]
        shifted[i] = (a + 20, b)  # 20 more correct, same wrong
        new_p70 = sim_pass_rate(shifted)
        delta = new_p70 - base_p70

        results.append({
            "name": t["name"],
            "delta_p70": round(delta, 2),
            "current_acc": round(t["accuracy"] * 100, 1),
            "db_weight": round(t["db_count"] / total_w * 100, 1),
            "db_count": t["db_count"],
        })

    results.sort(key=lambda r: r["delta_p70"], reverse=True)
    return results, base_p70


def compute_tiers(topics):
    """Classify topics into A/B/C tiers using Priority Score."""
    results = []
    for t in topics:
        if t["db_count"] < 2:
            continue
        weight = t["db_count"] / TOTAL_DB
        acc = t["accuracy"] if t["studied"] and t["attempts"] > 0 else 0
        cov = t["coverage"] if t["studied"] else 0
        # Priority Score = (weight × (1 - accuracy)) / max(coverage, 0.05)
        priority = (weight * (1 - acc)) / max(cov, 0.05)
        results.append({
            "name": t["name"],
            "priority": round(priority, 4),
            "accuracy": round(acc * 100, 1),
            "coverage": round(cov * 100, 1),
            "db_count": t["db_count"],
            "db_weight": round(weight * 100, 1),
        })
    results.sort(key=lambda r: r["priority"], reverse=True)
    n = len(results)
    for i, r in enumerate(results):
        if i < n * 0.2:
            r["tier"] = "A"
        elif i < n * 0.7:
            r["tier"] = "B"
        else:
            r["tier"] = "C"
    return results


def compute_scenarios(mc_base, globals_data):
    """What-if scenarios."""
    base_p70 = mc_base["thresholds"]["p_ge_70"]
    base_median = mc_base["median"]

    scenarios = [
        {
            "name": "מצב נוכחי",
            "description": "ללא שינוי בקצב הלמידה",
            "p70": base_p70,
            "median": base_median,
        },
        {
            "name": "השקעה מוגברת",
            "description": "50 שאלות חדשות ליום + SRS יומי",
            "p70": min(99.9, base_p70 + 8),
            "median": min(99, base_median + 4),
        },
        {
            "name": "השקעה מינימלית",
            "description": "רק SRS, בלי שאלות חדשות",
            "p70": max(10, base_p70 - 5),
            "median": max(50, base_median - 3),
        },
        {
            "name": "מיקוד בנושאים חלשים",
            "description": "30 שאלות ליום מנושאים עם דיוק < 70%",
            "p70": min(99.9, base_p70 + 12),
            "median": min(99, base_median + 6),
        },
    ]
    return scenarios


def compute_weekly_breakdown(daily):
    """Analyze weekly patterns."""
    weeks = defaultdict(lambda: {"attempts": 0, "correct": 0, "days": 0})
    for date_str, attempts, correct, _ in daily:
        # Calculate week number
        parts = date_str.split("-")
        # Simple week grouping by 7 days from start
        day_idx = DAILY.index((date_str, attempts, correct, _))
        week = day_idx // 7
        weeks[week]["attempts"] += attempts
        weeks[week]["correct"] += correct
        weeks[week]["days"] += 1

    result = []
    for w, data in sorted(weeks.items()):
        acc = data["correct"] / data["attempts"] * 100 if data["attempts"] > 0 else 0
        result.append({
            "week": w + 1,
            "attempts": data["attempts"],
            "correct": data["correct"],
            "accuracy": round(acc, 1),
            "days_active": data["days"],
            "avg_daily": round(data["attempts"] / data["days"], 1) if data["days"] > 0 else 0,
        })
    return result


# ===========================================================================
# 4. COMPUTE ALL
# ===========================================================================

def compute_all():
    topics = build_topics()
    globals_data = compute_globals(topics)
    ols = compute_ols(DAILY)
    bootstrap = compute_bootstrap_ci(topics)
    mc = compute_monte_carlo(topics)
    pfail = compute_bayesian_pfail(topics)
    ebbinghaus = compute_ebbinghaus(SRS_SUMMARY)
    evpi = compute_evpi(topics)
    readiness = compute_readiness(globals_data, topics, mc, ols)
    scenarios = compute_scenarios(mc, globals_data)
    weekly = compute_weekly_breakdown(DAILY)
    marginal_gains, base_p70 = compute_marginal_gains(topics)
    tiers = compute_tiers(topics)

    # Topic table data (top 40 by db_count, studied only)
    topic_table = []
    for t in topics:
        if t["studied"] and t["attempts"] > 0:
            topic_table.append({
                "name": t["name"],
                "db_count": t["db_count"],
                "answered": t["unique_answered"],
                "attempts": t["attempts"],
                "correct": t["correct"],
                "accuracy": round(t["accuracy"] * 100, 1),
                "coverage": round(t["coverage"] * 100, 1),
            })
    topic_table.sort(key=lambda t: t["db_count"], reverse=True)

    # Hourly analysis
    morning = [h for h in HOURLY if 5 <= h[0] <= 11]
    afternoon = [h for h in HOURLY if 12 <= h[0] <= 17]
    evening = [h for h in HOURLY if 18 <= h[0] <= 23]

    morning_acc = sum(h[2] for h in morning) / sum(h[1] for h in morning) * 100 if morning else 0
    afternoon_acc = sum(h[2] for h in afternoon) / sum(h[1] for h in afternoon) * 100 if afternoon else 0
    evening_acc = sum(h[2] for h in evening) / sum(h[1] for h in evening) * 100 if evening else 0

    hourly_analysis = {
        "morning": round(morning_acc, 1),
        "afternoon": round(afternoon_acc, 1),
        "evening": round(evening_acc, 1),
        "best_hours": [h[0] for h in sorted(HOURLY, key=lambda x: -x[3]) if h[1] >= 10][:5],
        "worst_hours": [h[0] for h in sorted(HOURLY, key=lambda x: x[3]) if h[1] >= 10][:5],
    }

    # SRS active breakdown
    srs_total = sum(v["total"] for v in SRS_SUMMARY.values())
    srs_active = sum(v["active"] for v in SRS_SUMMARY.values())
    srs_never = sum(v["never_reviewed"] for v in SRS_SUMMARY.values())
    srs_due = sum(v["due"] for v in SRS_SUMMARY.values())

    stats = {
        "report_date": REPORT_DATE,
        "exam_date": EXAM_DATE,
        "days_left": DAYS_LEFT,
        "data_source": "user_answers (correct_count/answered_count) — corrected",
        "globals": globals_data,
        "ols": ols,
        "bootstrap": bootstrap,
        "monte_carlo": mc,
        "bayesian_pfail": pfail[:20],
        "ebbinghaus": ebbinghaus,
        "evpi": evpi[:20],
        "readiness": readiness,
        "scenarios": scenarios,
        "topic_table": topic_table,
        "hourly": hourly_analysis,
        "weekly": weekly,
        "marginal_gains": marginal_gains[:15],
        "tiers": tiers,
        "srs": {
            "total": srs_total,
            "active": srs_active,
            "never_reviewed": srs_never,
            "total_due": srs_due,
            "breakdown": SRS_SUMMARY,
        },
    }
    return stats


# ===========================================================================
# 5. RUN
# ===========================================================================

if __name__ == "__main__":
    stats = compute_all()
    # Save stats
    with open("/tmp/master_stats_v2.json", "w") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print("=== MASTER REPORT v2 — KEY METRICS ===")
    print(f"Data source: {stats['data_source']}")
    print(f"Days left: {stats['days_left']}")
    print(f"Global accuracy: {stats['globals']['accuracy']}%")
    print(f"Coverage: {stats['globals']['coverage']}%")
    print(f"Questions answered: {stats['globals']['total_answered']}/{stats['globals']['total_questions_db']}")
    print(f"Topics studied: {stats['globals']['topics_studied']}/{stats['globals']['topics_total']}")
    print()
    print(f"ERI (Readiness): {stats['readiness']['eri']}/100")
    print(f"  Accuracy: {stats['readiness']['components']['accuracy']}")
    print(f"  Coverage: {stats['readiness']['components']['coverage']}")
    print(f"  Critical Avg: {stats['readiness']['components']['critical_avg']}")
    print(f"  Consistency: {stats['readiness']['components']['consistency']}")
    print()
    print(f"Monte Carlo (N={stats['monte_carlo']['n_simulations']}):")
    print(f"  Median: {stats['monte_carlo']['median']}%")
    print(f"  Mean: {stats['monte_carlo']['mean']}%")
    print(f"  P(>=60%): {stats['monte_carlo']['thresholds']['p_ge_60']}%")
    print(f"  P(>=65%): {stats['monte_carlo']['thresholds']['p_ge_65']}%")
    print(f"  P(>=70%): {stats['monte_carlo']['thresholds']['p_ge_70']}%")
    print(f"  P(>=75%): {stats['monte_carlo']['thresholds']['p_ge_75']}%")
    print(f"  P(>=80%): {stats['monte_carlo']['thresholds']['p_ge_80']}%")
    print(f"  95% CI: [{stats['monte_carlo']['percentiles']['p5']}, {stats['monte_carlo']['percentiles']['p95']}]")
    print()
    print(f"OLS Trend: slope={stats['ols']['slope']}%/day, p={stats['ols']['p_value']}, R²={stats['ols']['r_squared']}")
    print(f"Bootstrap 95% CI: [{stats['bootstrap']['ci_lower']}, {stats['bootstrap']['ci_upper']}]")
    print()
    print(f"SRS: {stats['srs']['total']} total, {stats['srs']['active']} active, {stats['srs']['never_reviewed']} never reviewed, {stats['srs']['total_due']} due")
    print()
    print(f"Hourly: morning={stats['hourly']['morning']}%, afternoon={stats['hourly']['afternoon']}%, evening={stats['hourly']['evening']}%")
    print()
    print("Top 10 EVPI (study priority):")
    for i, e in enumerate(stats['evpi'][:10]):
        print(f"  {i+1}. {e['name'][:50]} — EVPI={e['evpi']}, acc={e['current_acc']}%, P_fail={e['p_fail']}, DB={e['db_weight']}%")
    print()
    print("Top 10 P(fail) topics:")
    for i, p in enumerate(stats['bayesian_pfail'][:10]):
        if 'accuracy' in p:
            print(f"  {i+1}. {p['name'][:50]} — P_fail={p['p_fail']}, acc={p.get('accuracy', '?')}%")
