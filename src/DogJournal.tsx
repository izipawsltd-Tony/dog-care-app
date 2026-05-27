import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const DEFAULT_KENNELS = Array.from({ length: 13 }, (_, i) => `Kennel ${i + 1}`);

const STEPS = [
  { key: "cleaning", icon: "🧹", label: "Kennel Cleaning", tasks: ["Remove waste & rubbish", "Wash & disinfect floor", "Replace bedding / blankets", "Ventilate kennel"] },
  { key: "feeding", icon: "🍖", label: "Feeding & Water", tasks: ["Measure correct food portion", "Morning feed", "Afternoon feed", "Replace fresh water"] },
  { key: "grooming", icon: "🛁", label: "Bath & Grooming", tasks: ["Bath (if scheduled)", "Blow dry & brush coat", "Trim nails / clean ears & eyes", "Check skin & coat"] },
  { key: "health", icon: "🩺", label: "Health Check", tasks: ["Observe behaviour & appetite", "Check temperature / stools", "Note any unusual symptoms", "Report to vet if needed"] },
];

const todayKey = new Date().toISOString().split("T")[0];
const todayLabel = new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

type Checks = Record<string, Record<string, Record<number, boolean>>>;

function initChecksForKennels(kennels: string[]): Checks {
  const c: Checks = {};
  kennels.forEach(k => {
    c[k] = {};
    STEPS.forEach(s => {
      c[k][s.key] = {};
      s.tasks.forEach((_, i) => { c[k][s.key][i] = false; });
    });
  });
  return c;
}

function mergeChecks(saved: any, kennels: string[]): Checks {
  const base = initChecksForKennels(kennels);
  if (!saved || typeof saved !== "object") return base;
  kennels.forEach(k => {
    if (saved[k] && typeof saved[k] === "object") {
      STEPS.forEach(s => {
        if (saved[k][s.key] && typeof saved[k][s.key] === "object") {
          s.tasks.forEach((_, i) => {
            if (typeof saved[k][s.key][i] === "boolean") {
              base[k][s.key][i] = saved[k][s.key][i];
            }
          });
        }
      });
    }
  });
  return base;
}

export default function DogJournal({ staffNames = ["Staff 1", "Staff 2", "Staff 3"] }: { staffNames?: string[] }) {
  const [kennels, setKennels] = useState<string[]>(DEFAULT_KENNELS);
  const [activeKennel, setActiveKennel] = useState(DEFAULT_KENNELS[0]);
  const [dogNames, setDogNames] = useState<Record<string, string>>({});
  const [assignedStaff, setAssignedStaff] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Checks>(() => initChecksForKennels(DEFAULT_KENNELS));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [staffFilter, setStaffFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [showAddKennel, setShowAddKennel] = useState(false);
  const [newKennelName, setNewKennelName] = useState("");
  const [editingKennel, setEditingKennel] = useState<string | null>(null);
  const [editKennelName, setEditKennelName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "journals", todayKey));
        if (snap.exists()) {
          const data = snap.data();
          const loadedKennels = data.kennels || DEFAULT_KENNELS;
          setKennels(loadedKennels);
          if (data.checks) setChecks(mergeChecks(data.checks, loadedKennels));
          if (data.dogNames) setDogNames(data.dogNames);
          if (data.assignedStaff) setAssignedStaff(data.assignedStaff);
          if (data.notes) setNotes(data.notes);
          setActiveKennel(loadedKennels[0]);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const saveToFirebase = async (k = kennels, c = checks, dn = dogNames, as_ = assignedStaff, n = notes) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "journals", todayKey), { kennels: k, checks: c, dogNames: dn, assignedStaff: as_, notes: n, updatedAt: new Date().toISOString() });
      setSavedMsg("✓ Saved");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) { setSavedMsg("Error saving!"); }
    setSaving(false);
  };

  const addKennel = () => {
    const name = newKennelName.trim();
    if (!name || kennels.includes(name)) return;
    const newKennels = [...kennels, name];
    const newChecks = { ...checks, [name]: Object.fromEntries(STEPS.map(s => [s.key, Object.fromEntries(s.tasks.map((_, i) => [i, false]))])) };
    setKennels(newKennels);
    setChecks(newChecks);
    setNewKennelName("");
    setShowAddKennel(false);
    setActiveKennel(name);
    setView("detail");
    saveToFirebase(newKennels, newChecks);
  };

  const removeKennel = (name: string) => {
    const newKennels = kennels.filter(k => k !== name);
    const newChecks = { ...checks };
    delete newChecks[name];
    const newDogNames = { ...dogNames };
    delete newDogNames[name];
    const newAssignedStaff = { ...assignedStaff };
    delete newAssignedStaff[name];
    const newNotes = { ...notes };
    delete newNotes[name];
    setKennels(newKennels);
    setChecks(newChecks);
    setDogNames(newDogNames);
    setAssignedStaff(newAssignedStaff);
    setNotes(newNotes);
    setActiveKennel(newKennels[0] || "");
    setConfirmRemove(null);
    saveToFirebase(newKennels, newChecks, newDogNames, newAssignedStaff, newNotes);
  };

  const renameKennel = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || kennels.includes(trimmed)) return;
    const newKennels = kennels.map(k => k === oldName ? trimmed : k);
    const newChecks: Checks = {};
    Object.keys(checks).forEach(k => { newChecks[k === oldName ? trimmed : k] = checks[k]; });
    const newDogNames: Record<string, string> = {};
    Object.keys(dogNames).forEach(k => { newDogNames[k === oldName ? trimmed : k] = dogNames[k]; });
    const newAssigned: Record<string, string> = {};
    Object.keys(assignedStaff).forEach(k => { newAssigned[k === oldName ? trimmed : k] = assignedStaff[k]; });
    const newNotes: Record<string, string> = {};
    Object.keys(notes).forEach(k => { newNotes[k === oldName ? trimmed : k] = notes[k]; });
    setKennels(newKennels);
    setChecks(newChecks);
    setDogNames(newDogNames);
    setAssignedStaff(newAssigned);
    setNotes(newNotes);
    if (activeKennel === oldName) setActiveKennel(trimmed);
    setEditingKennel(null);
    saveToFirebase(newKennels, newChecks, newDogNames, newAssigned, newNotes);
  };

  const toggle = (kennel: string, step: string, idx: number) => {
    setChecks(prev => {
      const k = prev[kennel] || {};
      const s = k[step] || {};
      return { ...prev, [kennel]: { ...k, [step]: { ...s, [idx]: !s[idx] } } };
    });
  };

  const progress = (kennel: string) => {
    let total = 0, done = 0;
    STEPS.forEach(s => s.tasks.forEach((_, i) => { total++; if (checks[kennel]?.[s.key]?.[i]) done++; }));
    return total === 0 ? 0 : Math.round((done / total) * 100);
  };

  const stepProgress = (kennel: string, stepKey: string, tasks: string[]) => {
    const done = tasks.filter((_, i) => checks[kennel]?.[stepKey]?.[i]).length;
    return { done, total: tasks.length };
  };

  const getCheck = (kennel: string, step: string, idx: number) => checks[kennel]?.[step]?.[idx] ?? false;
  const filteredKennels = staffFilter === "All" ? kennels : kennels.filter(k => assignedStaff[k] === staffFilter);
  const doneCount = kennels.filter(k => progress(k) === 100).length;

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, fontFamily: "var(--font-sans)", color: "var(--color-text-secondary)" }}>Loading data...</div>;

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Daily Dog Care</div>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{todayLabel}</div>
      </div>

      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>Today's Progress</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: doneCount === kennels.length ? "#1D9E75" : "var(--color-text-primary)" }}>
            {doneCount}<span style={{ fontSize: 14, fontWeight: 400, color: "var(--color-text-secondary)" }}>/{kennels.length} kennels complete</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedMsg && <span style={{ fontSize: 12, color: "#1D9E75" }}>{savedMsg}</span>}
          <button onClick={() => saveToFirebase()} disabled={saving} style={{ padding: "7px 16px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {["All", ...staffNames].map(s => (
              <button key={s} onClick={() => setStaffFilter(s)} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: staffFilter === s ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: staffFilter === s ? "#EEEDFE" : "var(--color-background-primary)", color: staffFilter === s ? "#3C3489" : "var(--color-text-secondary)" }}>{s}</button>
            ))}
            <button onClick={() => setShowAddKennel(true)} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: "1.5px dashed var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-tertiary)", marginLeft: "auto" }}>+ Add Kennel</button>
          </div>

          {showAddKennel && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newKennelName} onChange={e => setNewKennelName(e.target.value)} onKeyDown={e => e.key === "Enter" && addKennel()} placeholder="Kennel name..." autoFocus style={{ flex: 1, padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "1.5px solid #534AB7", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
              <button onClick={addKennel} style={{ padding: "8px 16px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, cursor: "pointer" }}>Add</button>
              <button onClick={() => { setShowAddKennel(false); setNewKennelName(""); }} style={{ padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {filteredKennels.map(k => {
              const p = progress(k); const done = p === 100;
              return (
                <div key={k} style={{ background: done ? "#E1F5EE" : "var(--color-background-primary)", border: `1px solid ${done ? "#5DCAA5" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-lg)", padding: "12px", position: "relative" }}>
                  {editingKennel === k ? (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      <input value={editKennelName} onChange={e => setEditKennelName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") renameKennel(k, editKennelName); if (e.key === "Escape") setEditingKennel(null); }} autoFocus style={{ flex: 1, padding: "4px 6px", borderRadius: 4, border: "1.5px solid #534AB7", fontSize: 12, outline: "none" }} />
                      <button onClick={() => renameKennel(k, editKennelName)} style={{ padding: "4px 8px", borderRadius: 4, border: "none", background: "#534AB7", color: "#fff", fontSize: 11, cursor: "pointer" }}>✓</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span onClick={() => { setActiveKennel(k); setView("detail"); }} style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", flex: 1 }}>{k}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => { setEditingKennel(k); setEditKennelName(k); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--color-text-tertiary)", padding: "0 2px" }}>✏️</button>
                        <button onClick={() => setConfirmRemove(k)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#E24B4A", padding: "0 2px" }}>✕</button>
                      </div>
                    </div>
                  )}
                  {confirmRemove === k && (
                    <div style={{ background: "#FCEBEB", borderRadius: 6, padding: "6px 8px", marginBottom: 6, fontSize: 11 }}>
                      <div style={{ color: "#A32D2D", marginBottom: 4 }}>Remove {k}?</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => removeKennel(k)} style={{ flex: 1, padding: "3px", borderRadius: 4, border: "none", background: "#E24B4A", color: "#fff", fontSize: 11, cursor: "pointer" }}>Yes</button>
                        <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, padding: "3px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", fontSize: 11, cursor: "pointer" }}>No</button>
                      </div>
                    </div>
                  )}
                  <div onClick={() => { setActiveKennel(k); setView("detail"); }} style={{ cursor: "pointer" }}>
                    {dogNames[k] && <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>🐶 {dogNames[k]}</div>}
                    {assignedStaff[k] && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>👤 {assignedStaff[k]}</div>}
                    <div style={{ height: 5, background: "var(--color-border-tertiary)", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: p + "%", background: done ? "#1D9E75" : "#7F77DD", borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{p}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "detail" && activeKennel && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {kennels.map(k => (
              <button key={k} onClick={() => setActiveKennel(k)} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: activeKennel === k ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: activeKennel === k ? "#EEEDFE" : progress(k) === 100 ? "#E1F5EE" : "var(--color-background-primary)", color: activeKennel === k ? "#3C3489" : progress(k) === 100 ? "#085041" : "var(--color-text-secondary)" }}>
                {k} {progress(k) === 100 ? "✅" : `${progress(k)}%`}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>🐶 Dog name:</span>
              <input value={dogNames[activeKennel] || ""} onChange={e => setDogNames(p => ({ ...p, [activeKennel]: e.target.value }))} placeholder="Enter dog name..." style={{ flex: 1, padding: "6px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>👤 Staff:</span>
              <select value={assignedStaff[activeKennel] || ""} onChange={e => setAssignedStaff(p => ({ ...p, [activeKennel]: e.target.value }))} style={{ flex: 1, padding: "6px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
                <option value="">-- Select staff --</option>
                {staffNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STEPS.map(s => {
              const { done, total } = stepProgress(activeKennel, s.key, s.tasks);
              const allDone = done === total;
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
                    {s.tasks.map((task, i) => {
                      const checked = getCheck(activeKennel, s.key, i);
                      return (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < s.tasks.length - 1 ? "1px solid var(--color-border-tertiary)" : "none", cursor: "pointer" }}>
                          <div onClick={() => toggle(activeKennel, s.key, i)} style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, border: checked ? "2px solid #1D9E75" : "2px solid #888780", background: checked ? "#1D9E75" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", cursor: "pointer", boxSizing: "border-box" }}>
                            {checked && <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 13, color: checked ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: checked ? "line-through" : "none" }}>{task}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>📝 Notes ({dogNames[activeKennel] || activeKennel})</div>
            <textarea value={notes[activeKennel] || ""} onChange={e => setNotes(p => ({ ...p, [activeKennel]: e.target.value }))} placeholder="Note symptoms, special diet, vaccination schedule..." rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.6, fontFamily: "var(--font-sans)" }} />
          </div>
        </>
      )}

      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 12 }}>
        Daily Dog Care · {todayLabel} · Firebase
      </div>
    </div>
  );
}