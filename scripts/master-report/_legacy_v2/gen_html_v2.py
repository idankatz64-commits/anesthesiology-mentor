#!/usr/bin/env python3
"""Generate comprehensive HTML report from stats JSON."""

import json
from pathlib import Path

HERE = Path(__file__).parent

def load_stats():
    with open(HERE / "master_stats_v2.json") as f:
        return json.load(f)

def generate_html(s):
    g = s["globals"]
    r = s["readiness"]
    mc = s["monte_carlo"]
    ols_data = s["ols"]
    boot = s["bootstrap"]
    hourly = s["hourly"]
    srs = s["srs"]
    ebb = s["ebbinghaus"]

    # Prepare data for JS
    topic_table_js = json.dumps(s["topic_table"], ensure_ascii=False)
    evpi_js = json.dumps(s["evpi"], ensure_ascii=False)
    pfail_js = json.dumps(s["bayesian_pfail"], ensure_ascii=False)
    mc_hist_js = json.dumps(mc["histogram"])
    scenarios_js = json.dumps(s["scenarios"], ensure_ascii=False)
    marginal_js = json.dumps(s.get("marginal_gains", []), ensure_ascii=False)
    tiers_js = json.dumps(s.get("tiers", []), ensure_ascii=False)

    daily_dates = json.dumps([d[0] for d in [
        ("2026-03-21", 45, 33, 73.3), ("2026-03-22", 44, 27, 61.4),
        ("2026-03-23", 47, 37, 78.7), ("2026-03-24", 49, 33, 67.3),
        ("2026-03-26", 55, 42, 76.4), ("2026-03-27", 33, 22, 66.7),
        ("2026-03-28", 61, 45, 73.8), ("2026-03-29", 95, 62, 65.3),
        ("2026-03-30", 87, 64, 73.6), ("2026-03-31", 95, 67, 70.5),
        ("2026-04-01", 30, 28, 93.3), ("2026-04-02", 39, 36, 92.3),
        ("2026-04-03", 11, 7, 63.6), ("2026-04-04", 27, 17, 63.0),
        ("2026-04-05", 143, 118, 82.5), ("2026-04-06", 135, 93, 68.9),
        ("2026-04-07", 113, 78, 69.0), ("2026-04-08", 109, 81, 74.3),
        ("2026-04-09", 58, 50, 86.2), ("2026-04-10", 1, 1, 100.0),
        ("2026-04-11", 93, 73, 78.5),
    ]])
    daily_acc = json.dumps([d[3] for d in [
        ("2026-03-21", 45, 33, 73.3), ("2026-03-22", 44, 27, 61.4),
        ("2026-03-23", 47, 37, 78.7), ("2026-03-24", 49, 33, 67.3),
        ("2026-03-26", 55, 42, 76.4), ("2026-03-27", 33, 22, 66.7),
        ("2026-03-28", 61, 45, 73.8), ("2026-03-29", 95, 62, 65.3),
        ("2026-03-30", 87, 64, 73.6), ("2026-03-31", 95, 67, 70.5),
        ("2026-04-01", 30, 28, 93.3), ("2026-04-02", 39, 36, 92.3),
        ("2026-04-03", 11, 7, 63.6), ("2026-04-04", 27, 17, 63.0),
        ("2026-04-05", 143, 118, 82.5), ("2026-04-06", 135, 93, 68.9),
        ("2026-04-07", 113, 78, 69.0), ("2026-04-08", 109, 81, 74.3),
        ("2026-04-09", 58, 50, 86.2), ("2026-04-10", 1, 1, 100.0),
        ("2026-04-11", 93, 73, 78.5),
    ]])
    daily_attempts = json.dumps([d[1] for d in [
        ("2026-03-21", 45, 33, 73.3), ("2026-03-22", 44, 27, 61.4),
        ("2026-03-23", 47, 37, 78.7), ("2026-03-24", 49, 33, 67.3),
        ("2026-03-26", 55, 42, 76.4), ("2026-03-27", 33, 22, 66.7),
        ("2026-03-28", 61, 45, 73.8), ("2026-03-29", 95, 62, 65.3),
        ("2026-03-30", 87, 64, 73.6), ("2026-03-31", 95, 67, 70.5),
        ("2026-04-01", 30, 28, 93.3), ("2026-04-02", 39, 36, 92.3),
        ("2026-04-03", 11, 7, 63.6), ("2026-04-04", 27, 17, 63.0),
        ("2026-04-05", 143, 118, 82.5), ("2026-04-06", 135, 93, 68.9),
        ("2026-04-07", 113, 78, 69.0), ("2026-04-08", 109, 81, 74.3),
        ("2026-04-09", 58, 50, 86.2), ("2026-04-10", 1, 1, 100.0),
        ("2026-04-11", 93, 73, 78.5),
    ]])

    hourly_hours = json.dumps([h[0] for h in [
        (0,3,3,100.0),(2,1,1,100.0),(3,16,10,62.5),(4,30,25,83.3),
        (5,50,40,80.0),(6,93,73,78.5),(7,98,78,79.6),(8,77,58,75.3),
        (9,83,67,80.7),(10,84,67,79.8),(11,136,98,72.1),(12,94,65,69.1),
        (13,98,69,70.4),(14,101,75,74.3),(15,62,45,72.6),(16,41,28,68.3),
        (17,57,39,68.4),(18,91,58,63.7),(19,57,38,66.7),(20,68,55,80.9),
        (21,28,20,71.4),(22,1,1,100.0),(23,1,1,100.0),
    ]])
    hourly_acc = json.dumps([h[3] for h in [
        (0,3,3,100.0),(2,1,1,100.0),(3,16,10,62.5),(4,30,25,83.3),
        (5,50,40,80.0),(6,93,73,78.5),(7,98,78,79.6),(8,77,58,75.3),
        (9,83,67,80.7),(10,84,67,79.8),(11,136,98,72.1),(12,94,65,69.1),
        (13,98,69,70.4),(14,101,75,74.3),(15,62,45,72.6),(16,41,28,68.3),
        (17,57,39,68.4),(18,91,58,63.7),(19,57,38,66.7),(20,68,55,80.9),
        (21,28,20,71.4),(22,1,1,100.0),(23,1,1,100.0),
    ]])
    hourly_counts = json.dumps([h[1] for h in [
        (0,3,3,100.0),(2,1,1,100.0),(3,16,10,62.5),(4,30,25,83.3),
        (5,50,40,80.0),(6,93,73,78.5),(7,98,78,79.6),(8,77,58,75.3),
        (9,83,67,80.7),(10,84,67,79.8),(11,136,98,72.1),(12,94,65,69.1),
        (13,98,69,70.4),(14,101,75,74.3),(15,62,45,72.6),(16,41,28,68.3),
        (17,57,39,68.4),(18,91,58,63.7),(19,57,38,66.7),(20,68,55,80.9),
        (21,28,20,71.4),(22,1,1,100.0),(23,1,1,100.0),
    ]])

    # Ebbinghaus data for chart
    ebb_days = [1, 7, 14, 30, 66]
    ebb_confident = [ebb["confident"]["retention"][f"day_{d}"] for d in ebb_days]
    ebb_hesitant = [ebb["hesitant"]["retention"][f"day_{d}"] for d in ebb_days]
    ebb_guessed = [ebb["guessed"]["retention"][f"day_{d}"] for d in ebb_days]

    # Weekly data
    weekly_js = json.dumps(s["weekly"], ensure_ascii=False)

    html = f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Master Report v2 - {s["report_date"]}</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
:root {{
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --text: #e2e8f0;
  --text2: #94a3b8;
  --accent: #38bdf8;
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
  --orange: #fb923c;
  --purple: #a78bfa;
  --radius: 12px;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  direction: rtl;
  min-height: 100vh;
}}
.header {{
  background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
  padding: 24px 32px;
  border-bottom: 1px solid var(--surface2);
}}
.header h1 {{ font-size: 24px; margin-bottom: 4px; }}
.header .subtitle {{ color: var(--text2); font-size: 14px; }}
.header .meta {{ display: flex; gap: 24px; margin-top: 12px; flex-wrap: wrap; }}
.header .meta-item {{
  background: var(--surface);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
}}
.header .meta-item strong {{ color: var(--accent); }}
.tabs {{
  display: flex;
  background: var(--surface);
  border-bottom: 2px solid var(--surface2);
  overflow-x: auto;
  padding: 0 16px;
}}
.tab {{
  padding: 12px 20px;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  color: var(--text2);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s;
}}
.tab:hover {{ color: var(--text); }}
.tab.active {{
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: rgba(56, 189, 248, 0.05);
}}
.content {{ padding: 24px 32px; max-width: 1400px; margin: 0 auto; }}
.tab-content {{ display: none; }}
.tab-content.active {{ display: block; }}
.grid {{ display: grid; gap: 16px; }}
.grid-2 {{ grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }}
.grid-3 {{ grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }}
.grid-4 {{ grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }}
.card {{
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  border: 1px solid var(--surface2);
}}
.card h3 {{
  font-size: 13px;
  color: var(--text2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}}
.card .value {{
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}}
.card .sub {{ font-size: 12px; color: var(--text2); margin-top: 4px; }}
.green {{ color: var(--green); }}
.red {{ color: var(--red); }}
.yellow {{ color: var(--yellow); }}
.orange {{ color: var(--orange); }}
.accent {{ color: var(--accent); }}
.purple {{ color: var(--purple); }}
.chart-card {{
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  border: 1px solid var(--surface2);
  margin-bottom: 16px;
}}
.chart-card h3 {{
  font-size: 16px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--surface2);
}}
table {{
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}}
th {{
  background: var(--surface2);
  padding: 10px 12px;
  text-align: right;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--text2);
  position: sticky;
  top: 0;
}}
td {{
  padding: 8px 12px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
}}
tr:hover td {{ background: rgba(56, 189, 248, 0.03); }}
.acc-bar {{
  height: 6px;
  border-radius: 3px;
  background: var(--surface2);
  position: relative;
  overflow: hidden;
}}
.acc-bar-fill {{
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}}
.badge {{
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}}
.badge-green {{ background: rgba(74, 222, 128, 0.15); color: var(--green); }}
.badge-yellow {{ background: rgba(251, 191, 36, 0.15); color: var(--yellow); }}
.badge-red {{ background: rgba(248, 113, 113, 0.15); color: var(--red); }}
.section-title {{
  font-size: 18px;
  margin: 24px 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--accent);
  display: inline-block;
}}
.eri-ring {{
  width: 180px;
  height: 180px;
  margin: 0 auto;
  position: relative;
}}
.scenario-card {{
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  border: 1px solid var(--surface2);
}}
.scenario-card.current {{ border-color: var(--accent); }}
.scenario-card h4 {{ font-size: 15px; margin-bottom: 4px; }}
.scenario-card .desc {{ color: var(--text2); font-size: 13px; margin-bottom: 8px; }}
.progress-ring {{
  width: 120px;
  height: 120px;
}}
.table-container {{
  max-height: 600px;
  overflow-y: auto;
  border-radius: var(--radius);
  border: 1px solid var(--surface2);
}}
.correction-notice {{
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid var(--yellow);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
  font-size: 13px;
}}
.correction-notice strong {{ color: var(--yellow); }}
.insight-box {{
  background: rgba(56, 189, 248, 0.05);
  border-right: 3px solid var(--accent);
  padding: 12px 16px;
  margin: 12px 0;
  border-radius: 0 var(--radius) var(--radius) 0;
  font-size: 13px;
}}
@media (max-width: 768px) {{
  .content {{ padding: 16px; }}
  .header {{ padding: 16px; }}
  .grid-2, .grid-3, .grid-4 {{ grid-template-columns: 1fr; }}
}}
</style>
</head>
<body>

<div class="header">
  <h1>Master Statistical Report</h1>
  <div class="subtitle">YouShellNotPass - Anesthesiology Board Exam Analysis</div>
  <div class="meta">
    <div class="meta-item">תאריך: <strong>{s["report_date"]}</strong></div>
    <div class="meta-item">מבחן: <strong>{s["exam_date"]}</strong></div>
    <div class="meta-item">ימים שנותרו: <strong class="{'green' if s['days_left'] > 60 else 'yellow'}">{s["days_left"]}</strong></div>
    <div class="meta-item">מקור נתונים: <strong>user_answers (מתוקן)</strong></div>
    <div class="meta-item">גרסה: <strong>v2.0</strong></div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview', this)">סקירה כללית</div>
  <div class="tab" onclick="switchTab('topics', this)">ניתוח נושאים</div>
  <div class="tab" onclick="switchTab('forecast', this)">תחזית ומונטה קרלו</div>
  <div class="tab" onclick="switchTab('srs', this)">SRS וזיכרון</div>
  <div class="tab" onclick="switchTab('plan', this)">תוכנית פעולה</div>
</div>

<div class="content">

<!-- =============== TAB 1: OVERVIEW =============== -->
<div id="overview" class="tab-content active">

  <div class="correction-notice">
    <strong>תיקון נתונים:</strong> דוח זה משתמש ב-<code>user_answers</code> (correct_count/answered_count) במקום ב-<code>answer_history</code>.
    נמצא באג בכפתור "לחזור" ב-SRS שרשם 64 תשובות שגויות פנטום ל-answer_history, מה שהוריד את הדיוק באופן מלאכותי מ-77.8% ל-74.0%.
  </div>

  <div class="grid grid-4" style="margin-bottom: 20px;">
    <div class="card">
      <h3>ERI - מוכנות למבחן</h3>
      <div class="value {'green' if r['eri'] >= 70 else 'yellow' if r['eri'] >= 50 else 'red'}">{r['eri']}</div>
      <div class="sub">מתוך 100</div>
    </div>
    <div class="card">
      <h3>דיוק גלובלי</h3>
      <div class="value {'green' if g['accuracy'] >= 75 else 'yellow' if g['accuracy'] >= 65 else 'red'}">{g['accuracy']}%</div>
      <div class="sub">{g['total_correct']}/{g['total_attempts']} ניסיונות</div>
    </div>
    <div class="card">
      <h3>כיסוי</h3>
      <div class="value yellow">{g['coverage']}%</div>
      <div class="sub">{g['total_answered']}/{g['total_questions_db']} שאלות</div>
    </div>
    <div class="card">
      <h3>P(>=70%) מונטה קרלו</h3>
      <div class="value {'green' if mc['thresholds']['p_ge_70'] >= 80 else 'yellow' if mc['thresholds']['p_ge_70'] >= 50 else 'red'}">{mc['thresholds']['p_ge_70']}%</div>
      <div class="sub">N={mc['n_simulations']:,} סימולציות</div>
    </div>
  </div>

  <div class="grid grid-4" style="margin-bottom: 20px;">
    <div class="card">
      <h3>MC Median</h3>
      <div class="value accent">{mc['median']}%</div>
      <div class="sub">CI: [{mc['percentiles']['p5']}%-{mc['percentiles']['p95']}%]</div>
    </div>
    <div class="card">
      <h3>Bootstrap 95% CI</h3>
      <div class="value accent">{boot['ci_lower']}-{boot['ci_upper']}%</div>
      <div class="sub">2,000 iterations</div>
    </div>
    <div class="card">
      <h3>OLS Trend</h3>
      <div class="value {'green' if ols_data['slope'] > 0 else 'red'}">{'+' if ols_data['slope'] > 0 else ''}{ols_data['slope']}%/day</div>
      <div class="sub">p={ols_data['p_value']}, R\u00b2={ols_data['r_squared']}</div>
    </div>
    <div class="card">
      <h3>נושאים נלמדו</h3>
      <div class="value accent">{g['topics_studied']}/{g['topics_total']}</div>
      <div class="sub">כל הנושאים נותחו</div>
    </div>
  </div>

  <!-- ERI Components -->
  <div class="chart-card">
    <h3>רכיבי ERI (Exam Readiness Index)</h3>
    <div class="grid grid-4" style="margin-top: 12px;">
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2); margin-bottom: 4px;">דיוק (25%)</div>
        <div style="font-size: 24px; font-weight: 700;" class="{'green' if r['components']['accuracy'] >= 75 else 'yellow'}">{r['components']['accuracy']}</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2); margin-bottom: 4px;">כיסוי (25%)</div>
        <div style="font-size: 24px; font-weight: 700;" class="{'red' if r['components']['coverage'] < 40 else 'yellow'}">{r['components']['coverage']}</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2); margin-bottom: 4px;">נושאים קריטיים (30%)</div>
        <div style="font-size: 24px; font-weight: 700;" class="{'green' if r['components']['critical_avg'] >= 75 else 'yellow'}">{r['components']['critical_avg']}</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2); margin-bottom: 4px;">עקביות (20%)</div>
        <div style="font-size: 24px; font-weight: 700;" class="{'green' if r['components']['consistency'] >= 75 else 'yellow'}">{r['components']['consistency']}</div>
      </div>
    </div>
    <div class="insight-box" style="margin-top: 16px;">
      <strong>הצוואר בקבוק:</strong> כיסוי ({r['components']['coverage']}/100) — ענית על 22% מהשאלות ב-DB. הגדלת הכיסוי ל-35% תעלה את ה-ERI משמעותית.
    </div>
  </div>

  <!-- EVPI Table -->
  <div class="chart-card">
    <h3>EVPI — החזר השקעה לכל שעת לימוד</h3>
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>נושא</th>
            <th>EVPI</th>
            <th>P(fail)</th>
            <th>דיוק</th>
            <th>משקל DB</th>
            <th>פער</th>
            <th>נענו</th>
            <th>סה"כ DB</th>
          </tr>
        </thead>
        <tbody id="evpi-table-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Daily Trend -->
  <div class="chart-card">
    <h3>מגמת דיוק יומית + כמות ניסיונות</h3>
    <div id="chart-daily" style="height: 350px;"></div>
  </div>

  <!-- Hourly Performance -->
  <div class="chart-card">
    <h3>ביצועים לפי שעה</h3>
    <div id="chart-hourly" style="height: 300px;"></div>
    <div class="grid grid-3" style="margin-top: 12px;">
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">בוקר (5-11)</div>
        <div style="font-size: 20px; font-weight: 700;" class="green">{hourly['morning']}%</div>
      </div>
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">צהריים (12-17)</div>
        <div style="font-size: 20px; font-weight: 700;" class="yellow">{hourly['afternoon']}%</div>
      </div>
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">ערב (18-23)</div>
        <div style="font-size: 20px; font-weight: 700;" class="yellow">{hourly['evening']}%</div>
      </div>
    </div>
  </div>

</div>

<!-- =============== TAB 2: TOPICS =============== -->
<div id="topics" class="tab-content">

  <div class="section-title">טבלת נושאים מלאה</div>
  <div class="insight-box">
    נתונים מבוססי <code>user_answers</code> — הדיוק האמיתי שלך (ללא באג "לחזור").
    הנושאים ממוינים לפי משקל ב-DB (כמות שאלות).
  </div>

  <div class="chart-card">
    <h3>דיוק לפי נושא (20 הגדולים)</h3>
    <div id="chart-topic-bars" style="height: 500px;"></div>
  </div>

  <div class="table-container">
    <table id="topic-table">
      <thead>
        <tr>
          <th>#</th>
          <th>נושא</th>
          <th>ב-DB</th>
          <th>ענית</th>
          <th>ניסיונות</th>
          <th>נכון</th>
          <th>דיוק</th>
          <th>כיסוי</th>
          <th>מצב</th>
        </tr>
      </thead>
      <tbody id="topic-table-body"></tbody>
    </table>
  </div>
</div>

<!-- =============== TAB 3: FORECAST =============== -->
<div id="forecast" class="tab-content">

  <div class="grid grid-3" style="margin-bottom: 20px;">
    <div class="card">
      <h3>MC Median</h3>
      <div class="value accent">{mc['median']}%</div>
      <div class="sub">ממוצע: {mc['mean']}%, STD: {mc['std']}%</div>
    </div>
    <div class="card">
      <h3>P(>=70%)</h3>
      <div class="value green">{mc['thresholds']['p_ge_70']}%</div>
      <div class="sub">סיכוי לעבור את סף 70%</div>
    </div>
    <div class="card">
      <h3>P(>=75%)</h3>
      <div class="value yellow">{mc['thresholds']['p_ge_75']}%</div>
      <div class="sub">סיכוי לציון 75%+</div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-bottom: 20px;">
    <div class="card">
      <h3>התפלגות ציונים (Monte Carlo)</h3>
      <table>
        <tr><td>P5 (worst case)</td><td><strong>{mc['percentiles']['p5']}%</strong></td></tr>
        <tr><td>P25 (pessimistic)</td><td><strong>{mc['percentiles']['p25']}%</strong></td></tr>
        <tr><td>P50 (median)</td><td><strong class="accent">{mc['percentiles']['p50']}%</strong></td></tr>
        <tr><td>P75 (optimistic)</td><td><strong>{mc['percentiles']['p75']}%</strong></td></tr>
        <tr><td>P95 (best case)</td><td><strong>{mc['percentiles']['p95']}%</strong></td></tr>
      </table>
    </div>
    <div class="card">
      <h3>סיכויים לפי סף</h3>
      <table>
        <tr><td>P(>=60%)</td><td><strong class="green">{mc['thresholds']['p_ge_60']}%</strong></td></tr>
        <tr><td>P(>=65%)</td><td><strong class="green">{mc['thresholds']['p_ge_65']}%</strong></td></tr>
        <tr><td>P(>=70%)</td><td><strong class="green">{mc['thresholds']['p_ge_70']}%</strong></td></tr>
        <tr><td>P(>=75%)</td><td><strong class="yellow">{mc['thresholds']['p_ge_75']}%</strong></td></tr>
        <tr><td>P(>=80%)</td><td><strong class="red">{mc['thresholds']['p_ge_80']}%</strong></td></tr>
      </table>
    </div>
  </div>

  <!-- MC Histogram -->
  <div class="chart-card">
    <h3>היסטוגרמת מונטה קרלו (N=10,000)</h3>
    <div id="chart-mc-hist" style="height: 350px;"></div>
  </div>

  <!-- OLS Trend -->
  <div class="chart-card">
    <h3>מגמת דיוק (OLS Regression)</h3>
    <div class="grid grid-4" style="margin-bottom: 12px;">
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2);">Slope</div>
        <div style="font-size: 18px; font-weight: 700; color: {'var(--green)' if ols_data['slope'] > 0 else 'var(--red)'};">{'+' if ols_data['slope'] > 0 else ''}{ols_data['slope']}%/day</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2);">p-value</div>
        <div style="font-size: 18px; font-weight: 700;">{ols_data['p_value']}</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2);">R\u00b2</div>
        <div style="font-size: 18px; font-weight: 700;">{ols_data['r_squared']}</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: var(--text2);">Significant?</div>
        <div style="font-size: 18px; font-weight: 700;">{'Yes' if ols_data['significant'] else 'No (p>0.05)'}</div>
      </div>
    </div>
    <div class="insight-box">
      {'המגמה חיובית (+' + str(ols_data["slope"]) + '%/יום) אבל לא מובהקת סטטיסטית (p=' + str(ols_data["p_value"]) + '). זה נורמלי עם 21 ימי נתונים בלבד.' if not ols_data['significant'] else 'המגמה חיובית ומובהקת סטטיסטית!'}
    </div>
    <div id="chart-ols" style="height: 300px;"></div>
  </div>

  <!-- Scenarios -->
  <div class="section-title">תרחישים</div>
  <div class="grid grid-4" id="scenarios-container"></div>

</div>

<!-- =============== TAB 4: SRS & MEMORY =============== -->
<div id="srs" class="tab-content">

  <div class="grid grid-4" style="margin-bottom: 20px;">
    <div class="card">
      <h3>SRS - סה"כ</h3>
      <div class="value accent">{srs['total']}</div>
      <div class="sub">רשומות SRS</div>
    </div>
    <div class="card">
      <h3>SRS פעיל</h3>
      <div class="value green">{srs['active']}</div>
      <div class="sub">repetitions >= 1</div>
    </div>
    <div class="card">
      <h3>ממתינים (due)</h3>
      <div class="value yellow">{srs['total_due']}</div>
      <div class="sub">כולל {srs['never_reviewed']} שלא נבדקו מעולם</div>
    </div>
    <div class="card">
      <h3>לא נבדקו מעולם</h3>
      <div class="value orange">{srs['never_reviewed']}</div>
      <div class="sub">נוצרו אוטומטית</div>
    </div>
  </div>

  <div class="insight-box">
    <strong>למה 460 ממתינים?</strong> 155 מתוכם הם רשומות אוטומטיות שנוצרו כשענית על שאלות חדשות (repetitions=0).
    ה-SRS הפעיל שלך הוא {srs['active']} רשומות. מתוכן, ה-backlog האמיתי הוא {srs['total_due'] - srs['never_reviewed']} (בערך).
  </div>

  <!-- SRS breakdown -->
  <div class="chart-card">
    <h3>פירוט SRS לפי רמת ביטחון</h3>
    <table>
      <thead>
        <tr>
          <th>רמת ביטחון</th>
          <th>סה"כ</th>
          <th>פעילים</th>
          <th>ממתינים</th>
          <th>לא נבדקו</th>
          <th>Ease ממוצע</th>
          <th>Interval ממוצע</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge badge-green">confident</span></td>
          <td>{srs['breakdown']['confident']['total']}</td>
          <td>{srs['breakdown']['confident']['active']}</td>
          <td>{srs['breakdown']['confident']['due']}</td>
          <td>{srs['breakdown']['confident']['never_reviewed']}</td>
          <td>{srs['breakdown']['confident']['avg_ease']}</td>
          <td>{srs['breakdown']['confident']['avg_interval']} ימים</td>
        </tr>
        <tr>
          <td><span class="badge badge-yellow">hesitant</span></td>
          <td>{srs['breakdown']['hesitant']['total']}</td>
          <td>{srs['breakdown']['hesitant']['active']}</td>
          <td>{srs['breakdown']['hesitant']['due']}</td>
          <td>{srs['breakdown']['hesitant']['never_reviewed']}</td>
          <td>{srs['breakdown']['hesitant']['avg_ease']}</td>
          <td>{srs['breakdown']['hesitant']['avg_interval']} ימים</td>
        </tr>
        <tr>
          <td><span class="badge badge-red">guessed</span></td>
          <td>{srs['breakdown']['guessed']['total']}</td>
          <td>{srs['breakdown']['guessed']['active']}</td>
          <td>{srs['breakdown']['guessed']['due']}</td>
          <td>{srs['breakdown']['guessed']['never_reviewed']}</td>
          <td>{srs['breakdown']['guessed']['avg_ease']}</td>
          <td>{srs['breakdown']['guessed']['avg_interval']} ימים</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Ebbinghaus -->
  <div class="chart-card">
    <h3>עקומת שכחה (Ebbinghaus)</h3>
    <div id="chart-ebbinghaus" style="height: 350px;"></div>
    <div class="grid grid-3" style="margin-top: 12px;">
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">Confident - שימור ביום המבחן</div>
        <div style="font-size: 20px; font-weight: 700;" class="green">{ebb['confident']['retention']['day_66']}%</div>
        <div style="font-size: 11px; color: var(--text2);">Stability: {ebb['confident']['stability']} ימים</div>
      </div>
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">Hesitant - שימור ביום המבחן</div>
        <div style="font-size: 20px; font-weight: 700;" class="red">{ebb['hesitant']['retention']['day_66']}%</div>
        <div style="font-size: 11px; color: var(--text2);">Stability: {ebb['hesitant']['stability']} ימים</div>
      </div>
      <div style="text-align: center; padding: 8px;">
        <div style="font-size: 11px; color: var(--text2);">Guessed - שימור ביום המבחן</div>
        <div style="font-size: 20px; font-weight: 700;" class="red">{ebb['guessed']['retention']['day_66']}%</div>
        <div style="font-size: 11px; color: var(--text2);">Stability: {ebb['guessed']['stability']} ימים</div>
      </div>
    </div>
    <div class="insight-box">
      <strong>המשמעות:</strong> שאלות ברמת "confident" עם interval ממוצע של {srs['breakdown']['confident']['avg_interval']} ימים ו-ease {srs['breakdown']['confident']['avg_ease']}
      ישמרו {ebb['confident']['retention']['day_66']}% מהידע עד המבחן.
      שאלות "hesitant" ו-"guessed" ידרשו חזרה פעילה.
    </div>
  </div>

  <!-- SRS Pie -->
  <div class="chart-card">
    <h3>התפלגות SRS</h3>
    <div id="chart-srs-pie" style="height: 300px;"></div>
  </div>
</div>

<!-- =============== TAB 5: ACTION PLAN =============== -->
<div id="plan" class="tab-content">

  <!-- 3-Phase Framework -->
  <div class="chart-card" style="border: 1px solid var(--accent);">
    <h3 style="color: var(--accent);">תוכנית 66 ימים — 3 שלבים</h3>
    <div class="grid grid-3" style="margin-top: 16px;">
      <div class="card" style="border-top: 3px solid var(--red);">
        <h3 style="color: var(--red);">שלב 1: התקפה</h3>
        <div class="value" style="font-size: 20px;">ימים 1-30</div>
        <div class="sub" style="margin-top: 8px; font-size: 13px;">
          <strong>מיקוד:</strong> נושאי Tier A בלבד<br>
          <strong>יחס:</strong> 70% חומר חדש / 30% SRS<br>
          <strong>יעד:</strong> 3-4 נושאי Tier A בשבוע<br>
          <strong>כלל:</strong> נושא שהגיע ל-75%+ על 20+ שאלות → עובר ל-Tier B
        </div>
      </div>
      <div class="card" style="border-top: 3px solid var(--yellow);">
        <h3 style="color: var(--yellow);">שלב 2: שילוב</h3>
        <div class="value" style="font-size: 20px;">ימים 31-50</div>
        <div class="sub" style="margin-top: 8px; font-size: 13px;">
          <strong>מיקוד:</strong> Tier B + חזרה על Tier A<br>
          <strong>יחס:</strong> 40% חומר חדש / 60% חזרה<br>
          <strong>יעד:</strong> סימולציה אחת בשבוע<br>
          <strong>שיטה:</strong> Interleaving — לערבב נושאים בתוך סשן
        </div>
      </div>
      <div class="card" style="border-top: 3px solid var(--green);">
        <h3 style="color: var(--green);">שלב 3: גיבוש</h3>
        <div class="value" style="font-size: 20px;">ימים 51-66</div>
        <div class="sub" style="margin-top: 8px; font-size: 13px;">
          <strong>מיקוד:</strong> סימולציות + תיקון נקודתי<br>
          <strong>יחס:</strong> 10% חדש / 90% חזרה<br>
          <strong>יעד:</strong> סימולציה כל יומיים<br>
          <strong>כלל:</strong> אין נושאים חדשים ב-10 ימים אחרונים
        </div>
      </div>
    </div>
  </div>

  <!-- Daily Schedule -->
  <div class="chart-card">
    <h3>לו"ז יומי מומלץ (2.5 שעות)</h3>
    <table>
      <thead>
        <tr><th>בלוק</th><th>זמן</th><th>פעילות</th><th>הערות</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge badge-green">1</span></td>
          <td>30 דקות</td>
          <td><strong>SRS Review</strong></td>
          <td>כל ה-due cards. עדיפות: hesitant > guessed > confident. לעולם לא לדלג.</td>
        </tr>
        <tr>
          <td><span class="badge badge-red">2</span></td>
          <td>45 דקות</td>
          <td><strong>לימוד עמוק — נושא עדיפות</strong></td>
          <td>לפי טבלת Tier A למטה. לקרוא Miller + לענות על שאלות.</td>
        </tr>
        <tr>
          <td><span class="badge badge-yellow">3</span></td>
          <td>10 דקות</td>
          <td><strong>הפסקה</strong></td>
          <td>מחקר מראה: הפסקות קצרות מעלות שימור ב-15%</td>
        </tr>
        <tr>
          <td><span class="badge badge-yellow">4</span></td>
          <td>45 דקות</td>
          <td><strong>תרגול מעורב (Interleaving)</strong></td>
          <td>30-40 שאלות מ-2-3 נושאים שונים מעורבים</td>
        </tr>
        <tr>
          <td><span class="badge badge-green">5</span></td>
          <td>20 דקות</td>
          <td><strong>ניתוח טעויות</strong></td>
          <td>לעבור על כל שאלה שטעית, להבין למה, לסמן ל-SRS</td>
        </tr>
      </tbody>
    </table>
    <div class="insight-box">
      <strong>שעת הזהב שלך:</strong> הבוקר (5:00-11:00) — דיוק {hourly['morning']}% לעומת ערב {hourly['evening']}%.
      תעדיף ללמוד נושאים קשים בבוקר.
    </div>
  </div>

  <!-- Tier A Topics -->
  <div class="section-title">נושאי Tier A — עדיפות מקסימלית</div>
  <div class="insight-box">
    <strong>Priority Score = (משקל DB x (1 - דיוק)) / כיסוי</strong><br>
    נושאים שהם כבדים במבחן, עם דיוק נמוך, ועם כיסוי נמוך = ההשפעה הכי גדולה על הציון.
  </div>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Tier</th>
          <th>נושא</th>
          <th>Priority</th>
          <th>דיוק</th>
          <th>כיסוי</th>
          <th>ב-DB</th>
          <th>משקל</th>
        </tr>
      </thead>
      <tbody id="tiers-table-body"></tbody>
    </table>
  </div>

  <!-- Marginal Gains -->
  <div class="section-title" style="margin-top: 32px;">Marginal Gain Engine — אם תלמד 20 שאלות נוספות</div>
  <div class="insight-box">
    <strong>בדיוק כמו Polymarket:</strong> לא מדרגים לפי סיכון, מדרגים לפי <strong>Expected Value per unit of effort</strong>.<br>
    החישוב: מדמה "מה קורה ל-P(pass) אם תענה נכון על 20 שאלות נוספות בנושא הזה?"
  </div>
  <div class="chart-card">
    <h3>השפעה שולית על P(>=70%)</h3>
    <div id="chart-marginal" style="height: 400px;"></div>
  </div>

  <!-- P(fail) Chart -->
  <div class="section-title" style="margin-top: 32px;">נושאים בסיכון גבוה (Bayesian P_fail)</div>
  <div class="insight-box">
    <strong>P(fail) = ההסתברות שהדיוק האמיתי שלך מתחת ל-70%</strong><br>
    מבוסס על Beta(correct+1, wrong+1). ככל שיש יותר נתונים, הביטחון עולה.
  </div>
  <div class="chart-card">
    <h3>Top 15 P(fail)</h3>
    <div id="chart-pfail" style="height: 400px;"></div>
  </div>

  <!-- Milestones -->
  <div class="chart-card">
    <h3>יעדים שבועיים</h3>
    <table>
      <thead>
        <tr><th>שבוע</th><th>תאריכים</th><th>שלב</th><th>יעד</th><th>אבן דרך</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>11-17/4</td><td style="color:var(--red);">התקפה</td><td>3 נושאי Tier A</td><td>כיסוי 25%+</td></tr>
        <tr><td>2</td><td>18-24/4</td><td style="color:var(--red);">התקפה</td><td>3 נושאי Tier A</td><td>כיסוי 28%+</td></tr>
        <tr><td>3</td><td>25/4-1/5</td><td style="color:var(--red);">התקפה</td><td>3 נושאי Tier A + סימולציה</td><td>כיסוי 31%+</td></tr>
        <tr><td>4</td><td>2-8/5</td><td style="color:var(--red);">התקפה</td><td>3 נושאי Tier A + סימולציה</td><td>כיסוי 35%+, ERI>72</td></tr>
        <tr><td>5-6</td><td>9-22/5</td><td style="color:var(--yellow);">שילוב</td><td>Tier B + interleaving</td><td>כיסוי 40%+, ERI>75</td></tr>
        <tr><td>7-8</td><td>23/5-5/6</td><td style="color:var(--yellow);">שילוב</td><td>סימולציה שבועית + review</td><td>MC median>78%</td></tr>
        <tr><td>9-10</td><td>6-16/6</td><td style="color:var(--green);">גיבוש</td><td>סימולציה כל יומיים</td><td>P(>=70%)>97%</td></tr>
      </tbody>
    </table>
    <div class="insight-box">
      <strong>Bottom Line:</strong> הגדלת כיסוי מ-22% ל-40%+ דורשת ~600 שאלות חדשות (10/יום).
      בשילוב עם 30-60 SRS ביום, ה-ERI צפוי לעלות מ-{r['eri']} ל-~80.
    </div>
  </div>

</div>

</div><!-- end content -->

<script>
// ============================================================
// DATA
// ============================================================
const topicTable = {topic_table_js};
const evpiData = {evpi_js};
const pfailData = {pfail_js};
const mcHist = {mc_hist_js};
const scenarios = {scenarios_js};
const marginalData = {marginal_js};
const tiersData = {tiers_js};
const dailyDates = {daily_dates};
const dailyAcc = {daily_acc};
const dailyAttempts = {daily_attempts};
const hourlyHours = {hourly_hours};
const hourlyAcc = {hourly_acc};
const hourlyCounts = {hourly_counts};
const ebbDays = {json.dumps(ebb_days)};
const ebbConfident = {json.dumps(ebb_confident)};
const ebbHesitant = {json.dumps(ebb_hesitant)};
const ebbGuessed = {json.dumps(ebb_guessed)};

const plotlyLayout = {{
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {{ color: '#e2e8f0', family: '-apple-system, sans-serif' }},
  margin: {{ l: 50, r: 20, t: 30, b: 40 }},
  xaxis: {{ gridcolor: 'rgba(51,65,85,0.5)', zerolinecolor: 'rgba(51,65,85,0.5)' }},
  yaxis: {{ gridcolor: 'rgba(51,65,85,0.5)', zerolinecolor: 'rgba(51,65,85,0.5)' }},
}};
const plotlyConfig = {{ responsive: true, displayModeBar: false }};

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(id, el) {{
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
  // Trigger resize for Plotly charts
  setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
}}

// ============================================================
// TOPIC TABLE
// ============================================================
function renderTopicTable() {{
  const tbody = document.getElementById('topic-table-body');
  topicTable.forEach((t, i) => {{
    const accColor = t.accuracy >= 80 ? '#4ade80' : t.accuracy >= 70 ? '#fbbf24' : '#f87171';
    const badge = t.accuracy >= 80 ? '<span class="badge badge-green">טוב</span>' :
                  t.accuracy >= 70 ? '<span class="badge badge-yellow">בינוני</span>' :
                  '<span class="badge badge-red">חלש</span>';
    const shortName = t.name.length > 50 ? t.name.substring(0, 47) + '...' : t.name;
    tbody.innerHTML += `
      <tr>
        <td>${{i + 1}}</td>
        <td title="${{t.name}}">${{shortName}}</td>
        <td>${{t.db_count}}</td>
        <td>${{t.answered}}</td>
        <td>${{t.attempts}}</td>
        <td>${{t.correct}}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:${{accColor}};font-weight:700;min-width:45px;">${{t.accuracy}}%</span>
            <div class="acc-bar" style="flex:1;">
              <div class="acc-bar-fill" style="width:${{t.accuracy}}%;background:${{accColor}};"></div>
            </div>
          </div>
        </td>
        <td>${{t.coverage}}%</td>
        <td>${{badge}}</td>
      </tr>
    `;
  }});
}}

// ============================================================
// EVPI TABLE
// ============================================================
function renderEvpiTable() {{
  const tbody = document.getElementById('evpi-table-body');
  evpiData.forEach((e, i) => {{
    const shortName = e.name.length > 45 ? e.name.substring(0, 42) + '...' : e.name;
    const pfailColor = e.p_fail >= 0.7 ? '#f87171' : e.p_fail >= 0.4 ? '#fbbf24' : '#4ade80';
    tbody.innerHTML += `
      <tr>
        <td>${{i + 1}}</td>
        <td title="${{e.name}}">${{shortName}}</td>
        <td style="font-weight:700;color:var(--accent);">${{e.evpi}}</td>
        <td style="color:${{pfailColor}};font-weight:600;">${{(e.p_fail * 100).toFixed(0)}}%</td>
        <td>${{e.current_acc}}%</td>
        <td>${{e.db_weight}}%</td>
        <td>${{e.gap}}%</td>
        <td>${{e.unique_answered}}</td>
        <td>${{e.db_count}}</td>
      </tr>
    `;
  }});
}}

// ============================================================
// CHARTS
// ============================================================

function renderDailyChart() {{
  const trace1 = {{
    x: dailyDates, y: dailyAcc, type: 'scatter', mode: 'lines+markers',
    name: 'דיוק %', line: {{ color: '#38bdf8', width: 2 }},
    marker: {{ size: 6 }}, yaxis: 'y'
  }};
  const trace2 = {{
    x: dailyDates, y: dailyAttempts, type: 'bar',
    name: 'ניסיונות', marker: {{ color: 'rgba(167,139,250,0.4)' }}, yaxis: 'y2'
  }};
  const layout = {{
    ...plotlyLayout,
    yaxis: {{ ...plotlyLayout.yaxis, title: 'דיוק %', range: [50, 100] }},
    yaxis2: {{ overlaying: 'y', side: 'left', title: 'ניסיונות', gridcolor: 'rgba(0,0,0,0)', range: [0, 200] }},
    legend: {{ x: 0.01, y: 0.99, bgcolor: 'rgba(0,0,0,0)' }},
    shapes: [{{ type: 'line', x0: dailyDates[0], x1: dailyDates[dailyDates.length-1], y0: 70, y1: 70,
      line: {{ color: '#f87171', width: 1, dash: 'dash' }} }}],
    annotations: [{{ x: dailyDates[dailyDates.length-1], y: 70, text: 'סף 70%', showarrow: false,
      font: {{ color: '#f87171', size: 11 }}, yshift: 12 }}],
  }};
  Plotly.newPlot('chart-daily', [trace2, trace1], layout, plotlyConfig);
}}

function renderHourlyChart() {{
  const colors = hourlyAcc.map(a => a >= 80 ? '#4ade80' : a >= 70 ? '#fbbf24' : '#f87171');
  const trace = {{
    x: hourlyHours, y: hourlyAcc, type: 'bar',
    marker: {{ color: colors }},
    text: hourlyCounts.map(c => c + ' nis'),
    hovertemplate: 'שעה %{{x}}<br>דיוק: %{{y:.1f}}%<br>ניסיונות: %{{text}}<extra></extra>',
  }};
  const layout = {{
    ...plotlyLayout,
    xaxis: {{ ...plotlyLayout.xaxis, title: 'שעה', dtick: 1, type: 'category' }},
    yaxis: {{ ...plotlyLayout.yaxis, title: 'דיוק %', range: [50, 100], type: 'linear' }},
    shapes: [{{ type: 'line', x0: -0.5, x1: 23.5, y0: 70, y1: 70,
      line: {{ color: '#f87171', width: 1, dash: 'dash' }} }}],
  }};
  Plotly.newPlot('chart-hourly', [trace], layout, plotlyConfig);
}}

function renderTopicBars() {{
  const top20 = topicTable.slice(0, 20);
  const namesArr = top20.map(t => t.name.length > 35 ? t.name.substring(0, 32) + '...' : t.name);
  const accsArr = top20.map(t => t.accuracy);
  // Reverse copies (not in-place!) for horizontal bar chart
  const names = [...namesArr].reverse();
  const accs = [...accsArr].reverse();
  const colors = accs.map(a => a >= 80 ? '#4ade80' : a >= 70 ? '#fbbf24' : '#f87171');

  const trace = {{
    y: names, x: accs, type: 'bar', orientation: 'h',
    marker: {{ color: colors }},
    text: accs.map(a => a + '%'),
    textposition: 'outside',
    textfont: {{ color: '#e2e8f0' }},
  }};
  const layout = {{
    ...plotlyLayout,
    margin: {{ l: 250, r: 60, t: 20, b: 40 }},
    xaxis: {{ ...plotlyLayout.xaxis, title: 'דיוק %', range: [0, 110], type: 'linear' }},
    yaxis: {{ ...plotlyLayout.yaxis, type: 'category' }},
    shapes: [{{ type: 'line', x0: 70, x1: 70, y0: -0.5, y1: 19.5,
      line: {{ color: '#f87171', width: 1, dash: 'dash' }} }}],
  }};
  Plotly.newPlot('chart-topic-bars', [trace], layout, plotlyConfig);
}}

function renderMCHist() {{
  const x = mcHist.map(h => h[0]);
  const y = mcHist.map(h => h[1]);
  const colors = x.map(v => v >= 70 ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)');

  const trace = {{
    x: x, y: y, type: 'bar',
    marker: {{ color: colors, line: {{ color: colors.map(c => c.replace('0.6', '1')), width: 1 }} }},
    hovertemplate: 'ציון: %{{x}}-%{{x}}+2%<br>תדירות: %{{y}}<extra></extra>',
  }};
  const layout = {{
    ...plotlyLayout,
    xaxis: {{ ...plotlyLayout.xaxis, title: 'ציון במבחן %', type: 'linear' }},
    yaxis: {{ ...plotlyLayout.yaxis, title: 'תדירות', type: 'linear' }},
    shapes: [{{ type: 'line', x0: 70, x1: 70, y0: 0, y1: Math.max(...y) * 1.1,
      line: {{ color: '#f87171', width: 2, dash: 'dash' }} }}],
    annotations: [{{ x: 70, y: Math.max(...y) * 1.05, text: 'סף 70%', showarrow: false,
      font: {{ color: '#f87171', size: 12 }}, xshift: 20 }}],
  }};
  Plotly.newPlot('chart-mc-hist', [trace], layout, plotlyConfig);
}}

function renderOLSChart() {{
  const n = dailyAcc.length;
  const slope = {ols_data['slope']};
  const intercept = {ols_data['intercept']};
  const trendY = Array.from({{length: n}}, (_, i) => intercept + slope * i);

  const trace1 = {{
    x: dailyDates, y: dailyAcc, type: 'scatter', mode: 'markers',
    name: 'דיוק יומי', marker: {{ color: '#38bdf8', size: 8 }},
  }};
  const trace2 = {{
    x: dailyDates, y: trendY, type: 'scatter', mode: 'lines',
    name: 'OLS Trend', line: {{ color: '#fbbf24', width: 2, dash: 'dash' }},
  }};
  const layout = {{
    ...plotlyLayout,
    yaxis: {{ ...plotlyLayout.yaxis, title: 'דיוק %', range: [50, 100] }},
    legend: {{ x: 0.01, y: 0.99, bgcolor: 'rgba(0,0,0,0)' }},
  }};
  Plotly.newPlot('chart-ols', [trace1, trace2], layout, plotlyConfig);
}}

function renderScenarios() {{
  const container = document.getElementById('scenarios-container');
  scenarios.forEach((sc, i) => {{
    const cls = i === 0 ? 'scenario-card current' : 'scenario-card';
    const p70color = sc.p70 >= 80 ? '#4ade80' : sc.p70 >= 50 ? '#fbbf24' : '#f87171';
    container.innerHTML += `
      <div class="${{cls}}">
        <h4>${{sc.name}}</h4>
        <div class="desc">${{sc.description}}</div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <div>
            <div style="font-size:11px;color:var(--text2);">P(>=70%)</div>
            <div style="font-size:24px;font-weight:700;color:${{p70color}};">${{sc.p70}}%</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text2);">Median</div>
            <div style="font-size:24px;font-weight:700;color:var(--accent);">${{sc.median}}%</div>
          </div>
        </div>
      </div>
    `;
  }});
}}

function renderEbbinghaus() {{
  const trace1 = {{
    x: ebbDays, y: ebbConfident, type: 'scatter', mode: 'lines+markers',
    name: 'Confident', line: {{ color: '#4ade80', width: 2 }}, marker: {{ size: 8 }},
  }};
  const trace2 = {{
    x: ebbDays, y: ebbHesitant, type: 'scatter', mode: 'lines+markers',
    name: 'Hesitant', line: {{ color: '#fbbf24', width: 2 }}, marker: {{ size: 8 }},
  }};
  const trace3 = {{
    x: ebbDays, y: ebbGuessed, type: 'scatter', mode: 'lines+markers',
    name: 'Guessed', line: {{ color: '#f87171', width: 2 }}, marker: {{ size: 8 }},
  }};
  const layout = {{
    ...plotlyLayout,
    xaxis: {{ ...plotlyLayout.xaxis, title: 'ימים מהחזרה האחרונה', type: 'linear' }},
    yaxis: {{ ...plotlyLayout.yaxis, title: 'שימור %', range: [0, 100], type: 'linear' }},
    legend: {{ x: 0.7, y: 0.95, bgcolor: 'rgba(0,0,0,0)' }},
    shapes: [{{ type: 'line', x0: 66, x1: 66, y0: 0, y1: 100,
      line: {{ color: '#a78bfa', width: 1, dash: 'dash' }} }}],
    annotations: [{{ x: 66, y: 95, text: 'יום המבחן', showarrow: false,
      font: {{ color: '#a78bfa', size: 11 }}, xshift: -30 }}],
  }};
  Plotly.newPlot('chart-ebbinghaus', [trace1, trace2, trace3], layout, plotlyConfig);
}}

function renderSRSPie() {{
  const trace = {{
    values: [{srs['breakdown']['confident']['active']}, {srs['breakdown']['hesitant']['active']}, {srs['breakdown']['guessed']['active']}, {srs['never_reviewed']}],
    labels: ['Confident (active)', 'Hesitant (active)', 'Guessed (active)', 'Never Reviewed'],
    type: 'pie',
    marker: {{ colors: ['#4ade80', '#fbbf24', '#f87171', '#64748b'] }},
    textinfo: 'label+percent',
    textfont: {{ color: '#e2e8f0', size: 12 }},
    hole: 0.4,
  }};
  const layout = {{
    ...plotlyLayout,
    showlegend: false,
  }};
  Plotly.newPlot('chart-srs-pie', [trace], layout, plotlyConfig);
}}

function renderPfailChart() {{
  const top15 = pfailData.filter(p => p.accuracy !== undefined).slice(0, 15);
  const namesArr = top15.map(p => p.name.length > 35 ? p.name.substring(0, 32) + '...' : p.name);
  const valsArr = top15.map(p => p.p_fail * 100);
  // Reverse copies for horizontal bar
  const names = [...namesArr].reverse();
  const vals = [...valsArr].reverse();
  const colors = vals.map(v => v >= 70 ? '#f87171' : v >= 40 ? '#fbbf24' : '#4ade80');

  const trace = {{
    y: names, x: vals, type: 'bar', orientation: 'h',
    marker: {{ color: colors }},
    text: vals.map(v => v.toFixed(0) + '%'),
    textposition: 'outside',
    textfont: {{ color: '#e2e8f0' }},
  }};
  const layout = {{
    ...plotlyLayout,
    margin: {{ l: 250, r: 60, t: 20, b: 40 }},
    xaxis: {{ ...plotlyLayout.xaxis, title: 'P(fail) %', range: [0, 110], type: 'linear' }},
    yaxis: {{ ...plotlyLayout.yaxis, type: 'category' }},
  }};
  Plotly.newPlot('chart-pfail', [trace], layout, plotlyConfig);
}}

function renderTiersTable() {{
  const tbody = document.getElementById('tiers-table-body');
  if (!tbody) return;
  const tierColors = {{ A: '#f87171', B: '#fbbf24', C: '#4ade80' }};
  tiersData.forEach(t => {{
    const tr = document.createElement('tr');
    const tierCell = document.createElement('td');
    tierCell.style.textAlign = 'center';
    const badge = document.createElement('span');
    badge.textContent = t.tier;
    badge.style.cssText = 'display:inline-block;width:28px;height:28px;line-height:28px;border-radius:50%;font-weight:700;text-align:center;color:#1e293b;background:' + (tierColors[t.tier] || '#94a3b8');
    tierCell.appendChild(badge);

    const nameCell = document.createElement('td');
    nameCell.textContent = t.name;

    const prioCell = document.createElement('td');
    prioCell.style.textAlign = 'center';
    prioCell.textContent = t.priority.toFixed(3);

    const accCell = document.createElement('td');
    accCell.style.textAlign = 'center';
    accCell.style.color = t.accuracy < 70 ? '#f87171' : '#4ade80';
    accCell.textContent = t.accuracy.toFixed(1) + '%';

    const covCell = document.createElement('td');
    covCell.style.textAlign = 'center';
    covCell.textContent = t.coverage.toFixed(1) + '%';

    const cntCell = document.createElement('td');
    cntCell.style.textAlign = 'center';
    cntCell.textContent = t.db_count;

    const wgtCell = document.createElement('td');
    wgtCell.style.textAlign = 'center';
    wgtCell.textContent = t.db_weight.toFixed(1);

    tr.appendChild(tierCell);
    tr.appendChild(nameCell);
    tr.appendChild(prioCell);
    tr.appendChild(accCell);
    tr.appendChild(covCell);
    tr.appendChild(cntCell);
    tr.appendChild(wgtCell);
    tbody.appendChild(tr);
  }});
}}

function renderMarginalChart() {{
  const top = marginalData.slice(0, 15);
  const namesArr = top.map(m => m.name.length > 40 ? m.name.substring(0, 37) + '...' : m.name);
  const deltas = top.map(m => m.delta_p70);
  // Reverse copies for horizontal bar (top item at top)
  const names = [...namesArr].reverse();
  const vals = [...deltas].reverse();
  const colors = vals.map(v => v >= 1.5 ? '#f87171' : v >= 0.8 ? '#fbbf24' : '#4ade80');

  const trace = {{
    y: names, x: vals, type: 'bar', orientation: 'h',
    marker: {{ color: colors }},
    text: vals.map(v => '+' + v.toFixed(2) + '%'),
    textposition: 'outside',
    textfont: {{ color: '#e2e8f0' }},
  }};
  const layout = {{
    ...plotlyLayout,
    margin: {{ l: 280, r: 80, t: 20, b: 50 }},
    xaxis: {{ ...plotlyLayout.xaxis, title: '\u0394P(\u226570%) — \u05e2\u05dc\u05d9\u05d9\u05d4 \u05e6\u05e4\u05d5\u05d9\u05d4 \u05d1\u05d0\u05d7\u05d5\u05d6\u05d9 \u05e2\u05d1\u05d9\u05e8\u05d4', type: 'linear' }},
    yaxis: {{ ...plotlyLayout.yaxis, type: 'category' }},
  }};
  Plotly.newPlot('chart-marginal', [trace], layout, plotlyConfig);
}}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {{
  renderTopicTable();
  renderEvpiTable();
  renderDailyChart();
  renderHourlyChart();
  renderScenarios();
  // Lazy render other tabs on first visit
  let rendered = {{ overview: true }};
  document.querySelectorAll('.tab').forEach(tab => {{
    tab.addEventListener('click', function() {{
      const id = this.textContent.trim();
      if (!rendered.topics && document.getElementById('topics').classList.contains('active')) {{
        renderTopicBars();
        rendered.topics = true;
      }}
      if (!rendered.forecast && document.getElementById('forecast').classList.contains('active')) {{
        renderMCHist();
        renderOLSChart();
        rendered.forecast = true;
      }}
      if (!rendered.srs && document.getElementById('srs').classList.contains('active')) {{
        renderEbbinghaus();
        renderSRSPie();
        rendered.srs = true;
      }}
      if (!rendered.plan && document.getElementById('plan').classList.contains('active')) {{
        renderPfailChart();
        renderTiersTable();
        renderMarginalChart();
        rendered.plan = true;
      }}
    }});
  }});
}});
</script>

</body>
</html>'''
    return html


if __name__ == "__main__":
    import sys
    stats = load_stats()
    html = generate_html(stats)
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent.parent.parent / "reports" / "master_report_legacy_v2.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"HTML report written: {out} ({len(html):,} bytes)")
