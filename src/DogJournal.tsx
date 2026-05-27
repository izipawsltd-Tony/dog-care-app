import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const KENNELS = Array.from({ length: 13 }, (_, i) => `Kennel ${i + 1}`);


const STEPS = [
  { key: "cleaning", icon: "🧹", label: "Kennel Cleaning", tasks: ["Remove waste & rubbish", "Wash & disinfect floor", "Replace bedding / blankets", "Ventilate kennel"] },
  { key: "feeding", icon: "🍖", label: "Feeding & Water", tasks: ["Measure correct food portion", "Morning feed", "Afternoon feed", "Replace fresh water"] },
  { key: "grooming", icon: "🛁", label: "Bath & Grooming", tasks: ["Bath (if scheduled)", "Blow dry & brush coat", "Trim nails / clean ears & eyes", "Check skin & coat"] },
  { key: "health", icon: "🩺", label: "Health Check", tasks: ["Observe behaviour & appetite", "Check temperature / stools", "Note any unusual symptoms", "Report to vet if needed"] },
];

const todayKey = new Date().toISOString().split("T")[0];
const todayLabel = new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

function initChecks() {
  const c: Record<string, Record<string, Record<number, boolean>>> = {};
  KENNELS.forEach(k => { c[k] = {}; STEPS.forEach(s => { c[k][s.key] = {}; s.tasks.forEach((_, i) => { c[k][s.key][i] = false; }); }); });
  return c;
}

export default function DogJournal({ staffNames = ["Staff 1", "Staff 2", "Staff 3"] }: { staffNames?: string[] }) {
  const [activeKennel, setActiveKennel] = useState(KENNELS[0]);
  const [dogNames, setDogNames] = useState<Record<string, string>>(() => { const d: Record<string, string> = {}; KENNELS.forEach(k => { d[k] = ""; }); return d; });
  const [assignedStaff, setAssignedStaff] = useState<Record<string, string>>(() => { const d: Record<string, string> = {}; KENNELS.forEach(k => { d[k] = ""; }); return d; });
  const [checks, setChecks] = useState(initChecks);
  const [notes, setNotes] = useState<Record<string, string>>(() => { const d: Record<string, string> = {}; KENNELS.forEach(k => { d[k] = ""; }); return d; });
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [staffFilter, setStaffFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, "journals", todayKey);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.checks) setChecks(data.checks);
          if (data.dogNames) setDogNames(data.dogNames);
          if (data.assignedStaff) setAssignedStaff(data.assignedStaff);
          if (data.notes) setNotes(data.notes);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const saveToFirebase = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "journals", todayKey), { checks, dogNames, assignedStaff, notes, updatedAt: new Date().toISOString() });
      setSavedMsg("✓ Saved to Firebase");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) { setSavedMsg("Error saving!"); }
    setSaving(false);
  };

  const toggle = (kennel: string, step: string, idx: number) => {
    setChecks(prev => ({ ...prev, [kennel]: { ...prev[kennel], [step]: { ...prev[kennel][step], [idx]: !prev[kennel][step][idx] } } }));
  };

  const progress = (kennel: string) => {
    let total = 0, done = 0;
    STEPS.forEach(s => s.tasks.forEach((_, i) => { total++; if (checks[kennel]?.[s.key]?.[i]) done++; }));
    return Math.round((done / total) * 100);
  };

  const stepProgress = (kennel: string, stepKey: string, tasks: string[]) => {
    const done = tasks.filter((_, i) => checks[kennel]?.[stepKey]?.[i]).length;
    return { done, total: tasks.length };
  };

  const filteredKennels = staffFilter === "All" ? KENNELS : KENNELS.filter(k => assignedStaff[k] === staffFilter);
  const doneCount = KENNELS.filter(k => progress(k) === 100).length;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, fontFamily: "var(--font-sans)", color: "var(--color-text-secondary)" }}>
      Loading data...
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Daily Care Journal</div>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{todayLabel}</div>
      </div>

      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Today's Progress</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: doneCount === 13 ? "#1D9E75" : "var(--color-text-primary)" }}>
            {doneCount}<span style={{ fontSize: 14, fontWeight: 400, color: "var(--color-text-secondary)" }}>/13 kennels complete</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedMsg && <span style={{ fontSize: 12, color: "#1D9E75" }}>{savedMsg}</span>}
          <button onClick={saveToFirebase} disabled={saving} style={{ padding: "7px 16px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : "💾 Save"}
          </button>
          {["overview", "detail"].map(v => (
            <button key={v} onClick={() => setView(v as any)} style={{ padding: "6px 12px", borderRadius: "var(--border-radius-md)", fontSize: 13, cursor: "pointer", border: view === v ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: view === v ? "#EEEDFE" : "var(--color-background-primary)", color: view === v ? "#3C3489" : "var(--color-text-secondary)" }}>
              {v === "overview" ? "Overview" : "Detail"}
            </button>
          ))}
        </div>
      </div>

      {view === "overview" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {["All", ...STAFF].map(s => (
              <button key={s} onClick={() => setStaffFilter(s)} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: staffFilter === s ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: staffFilter === s ? "#EEEDFE" : "var(--color-background-primary)", color: staffFilter === s ? "#3C3489" : "var(--color-text-secondary)" }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {filteredKennels.map(k => {
              const p = progress(k); const done = p === 100;
              return (
                <div key={k} onClick={() => { setActiveKennel(k); setView("detail"); }} style={{ background: done ? "#E1F5EE" : "var(--color-background-primary)", border: `1px solid ${done ? "#5DCAA5" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-lg)", padding: "12px", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: done ? "#085041" : "var(--color-text-primary)" }}>{k}</span>
                    <span style={{ fontSize: 16 }}>{done ? "✅" : "○"}</span>
                  </div>
                  {dogNames[k] && <div style={{ fontSize: 11, color: done ? "#0F6E56" : "var(--color-text-secondary)", marginBottom: 4 }}>🐶 {dogNames[k]}</div>}
                  {assignedStaff[k] && <div style={{ fontSize: 11, color: done ? "#0F6E56" : "var(--color-text-tertiary)", marginBottom: 6 }}>👤 {assignedStaff[k].split(" ").slice(-2).join(" ")}</div>}
                  <div style={{ height: 5, background: done ? "#9FE1CB" : "var(--color-border-tertiary)", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: p + "%", background: done ? "#1D9E75" : "#7F77DD", borderRadius: 99, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: done ? "#0F6E56" : "var(--color-text-tertiary)", marginTop: 4 }}>{p}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "detail" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {KENNELS.map(k => (
              <button key={k} onClick={() => setActiveKennel(k)} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: activeKennel === k ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: activeKennel === k ? "#EEEDFE" : progress(k) === 100 ? "#E1F5EE" : "var(--color-background-primary)", color: activeKennel === k ? "#3C3489" : progress(k) === 100 ? "#085041" : "var(--color-text-secondary)" }}>
                {k} {progress(k) === 100 ? "✅" : `${progress(k)}%`}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>🐶 Dog name:</span>
              <input value={dogNames[activeKennel]} onChange={e => setDogNames(p => ({ ...p, [activeKennel]: e.target.value }))} placeholder="Enter dog name..." style={{ flex: 1, padding: "6px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>👤 Staff:</span>
              <select value={assignedStaff[activeKennel]} onChange={e => setAssignedStaff(p => ({ ...p, [activeKennel]: e.target.value }))} style={{ flex: 1, padding: "6px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
                <option value="">-- Select staff --</option>
                {STAFF.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STEPS.map(s => {
              const { done, total } = stepProgress(activeKennel, s.key, s.tasks); const allDone = done === total;
              return (
                <div key={s.key} style={{ border: `1px solid ${allDone ? "#5DCAA5" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: allDone ? "#E1F5EE" : "var(--color-background-secondary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{s.icon}</span>
                      <span style={{ fontWeight: 500, fontSize: 14, color: allDone ? "#085041" : "var(--color-text-primary)" }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 12, color: allDone ? "#0F6E56" : "var(--color-text-tertiary)" }}>{done}/{total}</span>
                  </div>
                  <div style={{ padding: "8px 14px 10px", background: "var(--color-background-primary)" }}>
                    {s.tasks.map((task, i) => (
                      <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < s.tasks.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", cursor: "pointer" }}>
                        <div onClick={() => toggle(activeKennel, s.key, i)} style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, border: checks[activeKennel]?.[s.key]?.[i] ? "2px solid #1D9E75" : "2px solid #888780", background: checks[activeKennel]?.[s.key]?.[i] ? "#1D9E75" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", cursor: "pointer", boxSizing: "border-box" }}>
                          {checks[activeKennel]?.[s.key]?.[i] && <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 13, color: checks[activeKennel]?.[s.key]?.[i] ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: checks[activeKennel]?.[s.key]?.[i] ? "line-through" : "none", transition: "all 0.15s" }}>{task}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>📝 Notes ({dogNames[activeKennel] || activeKennel})</div>
            <textarea value={notes[activeKennel]} onChange={e => setNotes(p => ({ ...p, [activeKennel]: e.target.value }))} placeholder="Note symptoms, special diet, vaccination schedule..." rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.6, fontFamily: "var(--font-sans)" }} />
          </div>
        </>
      )}

      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 12 }}>
        Daily Care Journal · {todayLabel} · Firebase
      </div>
    </div>
  );
}