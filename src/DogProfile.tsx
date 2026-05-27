import { useState, useRef, useEffect } from "react";
import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const KENNELS = Array.from({ length: 13 }, (_, i) => `Kennel ${i + 1}`);

const BREED_LIST = [
  "Labrador Retriever",
  "German Shepherd",
  "Golden Retriever",
  "Border Collie",
  "French Bulldog",
  "Bulldog",
  "Poodle",
  "Beagle",
  "Rottweiler",
  "Siberian Husky",
  "Other",
];

const BREED_MATING_WINDOW: Record<string, { from: number; to: number }> = {
  "Labrador Retriever": { from: 10, to: 14 },
  "German Shepherd": { from: 12, to: 15 },
  "default": { from: 10, to: 14 },
};

const WHELP_TOLERANCE = 3;

const getMatingWindow = (breed: string) =>
  BREED_MATING_WINDOW[breed] || BREED_MATING_WINDOW["default"];

const addDays = (dateStr: string, days: number) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateRange = (from: string, to: string) => {
  if (!from || !to) return "";
  const f = new Date(from).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const t = new Date(to).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return `${f} – ${t}`;
};

const DOC_TYPES = ["Vet Records / Vaccination Book", "Breed Certificate", "Test Results", "Hip and Elbow Scores", "Other"];

const REMINDER_OPTIONS = [
  { label: "7 days before", days: 7 },
  { label: "14 days before", days: 14 },
  { label: "1 month before", days: 30 },
  { label: "2 months before", days: 60 },
  { label: "3 months before", days: 90 },
];

const daysUntil = (dateStr: string) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

type VaccineRecord = { name: string; date: string; nextDate: string };
type MediaItem = { id: string; type: "image" | "video"; url: string; name: string; date: string };
type DocItem = { id: string; name: string; docType: string; date: string; url: string; fileType: string };
type HeatRecord = { id: string; lastHeat: string; nextHeat: string; cycleLength: string; notes: string; readyToMate: string; matingDate: string; expectedWhelp: string; actualWhelp: string };
type Dog = {
  id: string; name: string; breed: string; dob: string; weight: string;
  chipNumber: string; regNumber: string; gender: string; color: string;
  avatar: string; kennel: string; vaccines: VaccineRecord[];
  healthNotes: string; gallery: MediaItem[]; documents: DocItem[];
  heatRecords: HeatRecord[];
};

function newDog(id: string): Dog {
  return { id, name: "", breed: "", dob: "", weight: "", chipNumber: "", regNumber: "", gender: "", color: "", avatar: "", kennel: "", vaccines: [], healthNotes: "", gallery: [], documents: [], heatRecords: [] };
}

function genId() { return Date.now().toString(36).toUpperCase(); }

export default function App() {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [activeDogId, setActiveDogId] = useState<string | null>(null);
  const [tab, setTab] = useState<"info" | "vaccine" | "health" | "gallery" | "docs" | "heat" | "reminders">("info");
  const [saved, setSaved] = useState(false);
  const [newVaccine, setNewVaccine] = useState({ name: "", date: "", nextDate: "" });
  const [showAddVaccine, setShowAddVaccine] = useState(false);
  const [search, setSearch] = useState("");
  const [filterKennel, setFilterKennel] = useState("All");
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [newDoc, setNewDoc] = useState({ name: "", docType: DOC_TYPES[0] });
  const [newHeat, setNewHeat] = useState({ lastHeat: "", nextHeat: "", cycleLength: "", notes: "", readyToMate: "", matingDate: "", expectedWhelp: "", actualWhelp: "" });
  const [showAddHeat, setShowAddHeat] = useState(false);
  const [vaccineReminder, setVaccineReminder] = useState(REMINDER_OPTIONS[0]);
  const [heatReminder, setHeatReminder] = useState(REMINDER_OPTIONS[2]);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const activeDog = dogs.find(d => d.id === activeDogId) || null;

  // Load from Firebase on mount
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "dogProfiles", "all"));
        if (snap.exists() && snap.data().dogs) {
          setDogs(snap.data().dogs);
        }
      } catch (e) { console.error(e); }
      setLoadingData(false);
    };
    load();
  }, []);

  // Save all dogs to Firebase
  const saveToFirebase = async (updatedDogs: Dog[]) => {
    setSyncing(true);
    try {
      await setDoc(doc(db, "dogProfiles", "all"), { dogs: updatedDogs, updatedAt: new Date().toISOString() });
      setSyncMsg("✓ Saved");
      setTimeout(() => setSyncMsg(""), 2000);
    } catch (e) { setSyncMsg("Error saving!"); }
    setSyncing(false);
  };

  const addDog = () => {
    const dog = newDog("DOG-" + genId());
    const updated = [...dogs, dog];
    setDogs(updated);
    saveToFirebase(updated);
    setActiveDogId(dog.id);
    setTab("info");
    setSaved(false);
  };

  const updateDog = (field: keyof Dog, value: any) => {
    const updated = dogs.map(d => d.id === activeDogId ? { ...d, [field]: value } : d);
    setDogs(updated);
    setSaved(false);
  };

  const deleteDog = (id: string) => {
    if (!confirm("Delete this profile?")) return;
    const updated = dogs.filter(d => d.id !== id);
    setDogs(updated);
    saveToFirebase(updated);
    setActiveDogId(null);
  };

  const addVaccine = () => {
    if (!newVaccine.name || !newVaccine.date || !activeDog) return;
    updateDog("vaccines", [...activeDog.vaccines, newVaccine]);
    setNewVaccine({ name: "", date: "", nextDate: "" });
    setShowAddVaccine(false);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateDog("avatar", ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!activeDog) return;
    files.forEach(file => {
      const reader = new FileReader();
      const isVideo = file.type.startsWith("video/");
      reader.onload = ev => {
        const item: MediaItem = { id: genId(), type: isVideo ? "video" : "image", url: ev.target?.result as string, name: file.name, date: new Date().toLocaleDateString("en-AU") };
        setDogs(prev => prev.map(d => d.id === activeDogId ? { ...d, gallery: [...d.gallery, item] } : d));
      };
      reader.readAsDataURL(file);
    });
    setSaved(false);
  };

  const handleDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDog) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const item: DocItem = { id: genId(), name: newDoc.name || file.name, docType: newDoc.docType, date: new Date().toLocaleDateString("en-AU"), url: ev.target?.result as string, fileType: file.type };
      setDogs(prev => prev.map(d => d.id === activeDogId ? { ...d, documents: [...d.documents, item] } : d));
      setNewDoc({ name: "", docType: DOC_TYPES[0] });
    };
    reader.readAsDataURL(file);
    setSaved(false);
  };

  const removeGallery = (id: string) => updateDog("gallery", activeDog!.gallery.filter(g => g.id !== id));
  const removeDoc = (id: string) => updateDog("documents", activeDog!.documents.filter(d => d.id !== id));

  const age = (dob: string) => {
    if (!dob) return "";
    const months = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 12) return `${months} months old`;
    return `${Math.floor(months / 12)} yr ${months % 12} mo`;
  };

  const filteredDogs = dogs.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase());
    const matchKennel = filterKennel === "All" || d.kennel === filterKennel;
    return matchSearch && matchKennel;
  });

  const inp = (val: string, onChange: (v: string) => void, placeholder: string, type = "text") => (
    <input type={type} value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
  );

  const lbl = (text: string) => <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{text}</div>;

  const docIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return "📄";
    if (fileType.includes("image")) return "🖼️";
    if (fileType.includes("word")) return "📝";
    return "📎";
  };

  const urgencyColor = (days: number) => {
    if (days < 0) return { bg: "#FCEBEB", border: "#F09595", text: "#A32D2D", badge: "#E24B4A" };
    if (days <= 7) return { bg: "#FAECE7", border: "#F0997B", text: "#993C1D", badge: "#D85A30" };
    if (days <= 14) return { bg: "#FAEEDA", border: "#FAC775", text: "#633806", badge: "#BA7517" };
    return { bg: "#E6F1FB", border: "#85B7EB", text: "#0C447C", badge: "#378ADD" };
  };

  const urgencyLabel = (days: number) => {
    if (days < 0) return `Overdue ${Math.abs(days)}d`;
    if (days === 0) return "Due today!";
    if (days === 1) return "Due tomorrow";
    return `In ${days} days`;
  };

  // Compute reminders
  const vaccineAlerts = activeDog ? activeDog.vaccines.filter(v => {
    const dl = daysUntil(v.nextDate);
    return dl !== null && dl <= vaccineReminder.days;
  }).map(v => ({ name: v.name, dueDate: v.nextDate, daysLeft: daysUntil(v.nextDate)! })) : [];

  const heatAlerts = activeDog ? activeDog.heatRecords.filter(h => {
    const dl = daysUntil(h.nextHeat);
    return dl !== null && dl <= heatReminder.days;
  }).map(h => ({ nextHeat: h.nextHeat, daysLeft: daysUntil(h.nextHeat)!, notes: h.notes })) : [];

  const reminderCount = vaccineAlerts.length + heatAlerts.length;

  const TABS = [
    { k: "info", label: "📋 Info" },
    { k: "vaccine", label: "💉 Vaccines" },
    { k: "health", label: "🩺 Health" },
    { k: "heat", label: "🌡️ Heat Cycle" },
    { k: "gallery", label: "🖼️ Gallery" },
    { k: "docs", label: "📁 Documents" },
    { k: "reminders", label: `🔔 Reminders${reminderCount > 0 ? ` (${reminderCount})` : ""}` },
  ];

  const autoInp = (val: string, onChange: (v: string) => void, hint: string) => (
    <div>
      <input type="date" value={val} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1.5px solid #AFA9EC", background: "#EEEDFE", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
      {hint && <div style={{ fontSize: 10, color: "#534AB7", marginTop: 2 }}>{hint}</div>}
    </div>
  );

  if (loadingData) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, fontFamily: "var(--font-sans)", color: "var(--color-text-secondary)" }}>
      Loading profiles...
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", position: "relative" }}>
            {lightbox.type === "image"
              ? <img src={lightbox.url} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: "80vh", objectFit: "contain" }} />
              : <video src={lightbox.url} controls style={{ width: "100%", borderRadius: 8 }} />}
            <div style={{ color: "#fff", fontSize: 12, marginTop: 8, textAlign: "center" }}>{lightbox.name}</div>
            <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: -12, right: -12, width: 28, height: 28, borderRadius: "50%", background: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Dog Profiles</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{dogs.length} dog{dogs.length !== 1 ? "s" : ""} registered</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {syncMsg && <span style={{ fontSize: 12, color: "#1D9E75" }}>{syncMsg}</span>}
          <button onClick={addDog} style={{ padding: "8px 16px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>+ Add Dog</button>
        </div>
      </div>

      {/* Search + filter */}
      {!activeDog && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name or ID..."
            style={{ flex: 1, padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
          <select value={filterKennel} onChange={e => setFilterKennel(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
            <option value="All">All Kennels</option>
            {KENNELS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {/* Dog list */}
      {!activeDog && (
        <>
          {filteredDogs.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>
              {dogs.length === 0 ? "No profiles yet — click + Add Dog to get started" : "No results found"}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredDogs.map(d => (
              <div key={d.id} onClick={() => { setActiveDogId(d.id); setTab("info"); setSaved(false); }}
                style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {d.avatar ? <img src={d.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>🐶</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{d.name || "Unnamed"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {[d.breed, d.kennel, d.dob && age(d.dob)].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                    {d.gallery.length > 0 && `🖼️ ${d.gallery.length}  `}{d.documents.length > 0 && `📁 ${d.documents.length}`}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{d.id}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dog detail */}
      {activeDog && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button onClick={() => setActiveDogId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 13 }}>← Back</button>
            <button onClick={() => deleteDog(activeDog.id)} style={{ background: "none", border: "1px solid #F09595", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "#E24B4A", fontSize: 12, padding: "4px 10px" }}>Delete Profile</button>
          </div>

          {/* Profile card */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: 14, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", background: "var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-border-secondary)" }}>
                {activeDog.avatar ? <img src={activeDog.avatar} alt="dog" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 28 }}>🐶</span>}
              </div>
              <label style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: "#534AB7", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <span style={{ color: "#fff", fontSize: 12 }}>+</span>
                <input type="file" accept="image/*" onChange={handleAvatar} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{activeDog.name || "Unnamed"}</div>
              {activeDog.breed && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>🐾 {activeDog.breed} {activeDog.gender && `· ${activeDog.gender}`}</div>}
              {activeDog.dob && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1 }}>🎂 {age(activeDog.dob)}</div>}
              {activeDog.kennel && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1 }}>🏠 {activeDog.kennel}</div>}
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: "#EEEDFE", color: "#3C3489", fontSize: 11, padding: "2px 8px", borderRadius: 99 }}>{activeDog.id}</span>
                {reminderCount > 0 && <span style={{ background: "#E24B4A", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 99 }}>🔔 {reminderCount}</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t.k} onClick={() => setTab(t.k as any)} style={{ padding: "6px 10px", borderRadius: "var(--border-radius-md)", fontSize: 12, cursor: "pointer", border: tab === t.k ? "1.5px solid #534AB7" : "1.5px solid var(--color-border-tertiary)", background: tab === t.k ? "#EEEDFE" : "var(--color-background-primary)", color: tab === t.k ? "#3C3489" : "var(--color-text-secondary)" }}>{t.label}</button>
            ))}
          </div>

          {/* Tab: Info */}
          {tab === "info" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>{lbl("Name")}{inp(activeDog.name, v => updateDog("name", v), "Buddy, Max...")}</div>
                <div>{lbl("Breed")}
                  <select value={activeDog.breed} onChange={e => updateDog("breed", e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: activeDog.breed ? "var(--color-text-primary)" : "var(--color-text-tertiary)", fontSize: 13, outline: "none" }}>
                    <option value="">-- Select breed --</option>
                    {BREED_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>{lbl("Coat Colour")}{inp(activeDog.color, v => updateDog("color", v), "Golden, White...")}</div>
                <div>{lbl("Gender")}
                  <select value={activeDog.gender} onChange={e => updateDog("gender", e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
                    <option value="">-- Select --</option>
                    <option>Male</option><option>Female</option>
                  </select>
                </div>
                <div>{lbl("Date of Birth")}{inp(activeDog.dob, v => updateDog("dob", v), "", "date")}</div>
                <div>{lbl("Weight (kg)")}{inp(activeDog.weight, v => updateDog("weight", v), "5.2")}</div>
                <div>{lbl("Microchip Number")}{inp(activeDog.chipNumber, v => updateDog("chipNumber", v), "900123456789")}</div>
                <div>{lbl("Registration Number")}{inp(activeDog.regNumber, v => updateDog("regNumber", v), "ANKC-2024-001")}</div>
              </div>
              <div>{lbl("Current Kennel")}
                <select value={activeDog.kennel} onChange={e => updateDog("kennel", e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
                  <option value="">-- Select Kennel --</option>
                  {KENNELS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Tab: Vaccines */}
          {tab === "vaccine" && (
            <div>
              {activeDog.vaccines.length === 0 && !showAddVaccine && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>No vaccination records yet</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {activeDog.vaccines.map((v, i) => {
                  const dl = daysUntil(v.nextDate);
                  const isOverdue = dl !== null && dl < 0;
                  const isSoon = dl !== null && !isOverdue && dl <= 30;
                  return (
                    <div key={i} style={{ background: "var(--color-background-primary)", border: `1px solid ${isOverdue ? "#F09595" : isSoon ? "#FAC775" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>💉 {v.name}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>Date given: {v.date}</div>
                        {v.nextDate && <div style={{ fontSize: 11, color: isOverdue ? "#E24B4A" : isSoon ? "#BA7517" : "var(--color-text-secondary)", marginTop: 1 }}>{isOverdue ? "⚠️ Overdue: " : isSoon ? "⏰ Due soon: " : "Next due: "}{v.nextDate}</div>}
                      </div>
                      <button onClick={() => updateDog("vaccines", activeDog.vaccines.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 16 }}>✕</button>
                    </div>
                  );
                })}
              </div>
              {showAddVaccine ? (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>{lbl("Vaccine Name")}{inp(newVaccine.name, v => setNewVaccine(p => ({ ...p, name: v })), "Rabies, C5, Lepto...")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>{lbl("Date Given")}{inp(newVaccine.date, v => setNewVaccine(p => ({ ...p, date: v })), "", "date")}</div>
                    <div>{lbl("Next Due Date")}{inp(newVaccine.nextDate, v => setNewVaccine(p => ({ ...p, nextDate: v })), "", "date")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addVaccine} style={{ flex: 1, padding: "8px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, cursor: "pointer" }}>Add</button>
                    <button onClick={() => setShowAddVaccine(false)} style={{ flex: 1, padding: "8px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddVaccine(true)} style={{ width: "100%", padding: "10px", borderRadius: "var(--border-radius-md)", border: "1.5px dashed var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>+ Add Vaccination Record</button>
              )}
            </div>
          )}

          {/* Tab: Health */}
          {tab === "health" && (
            <div>
              {lbl("Health Notes")}
              <textarea value={activeDog.healthNotes} onChange={e => updateDog("healthNotes", e.target.value)} placeholder="Allergies, chronic conditions, current medications, vet notes..." rows={6}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.6, fontFamily: "var(--font-sans)" }} />
            </div>
          )}

          {/* Tab: Heat Cycle */}
          {tab === "heat" && (
            <div>
              {activeDog.gender === "Male" && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>Heat cycle tracking is only applicable for female dogs.</div>
              )}
              {activeDog.gender !== "Male" && (
                <>
                  {activeDog.heatRecords.length === 0 && !showAddHeat && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>No heat cycle records yet</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {activeDog.heatRecords.map((h, i) => {
                      const dl = daysUntil(h.nextHeat);
                      const isOverdue = dl !== null && dl < 0;
                      const isSoon = dl !== null && !isOverdue && dl <= 30;
                      const w = getMatingWindow(activeDog.breed);
                      const mateEnd = addDays(h.lastHeat, w.to);
                      const whelpFrom = h.matingDate ? addDays(h.matingDate, 63 - WHELP_TOLERANCE) : "";
                      const whelpTo = h.matingDate ? addDays(h.matingDate, 63 + WHELP_TOLERANCE) : "";
                      return (
                        <div key={h.id} style={{ background: "var(--color-background-primary)", border: `1px solid ${isOverdue ? "#F09595" : isSoon ? "#FAC775" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-md)", padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>🌡️ Heat Cycle {activeDog.heatRecords.length - i}</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                                {h.lastHeat && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Last heat: <span style={{ color: "var(--color-text-primary)" }}>{formatDate(h.lastHeat)}</span></div>}
                                {h.nextHeat && <div style={{ fontSize: 11, color: isOverdue ? "#E24B4A" : isSoon ? "#BA7517" : "var(--color-text-secondary)" }}>Next heat: {formatDate(h.nextHeat)}{dl !== null && ` · ${urgencyLabel(dl)}`}</div>}
                                {h.cycleLength && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Cycle: <span style={{ color: "var(--color-text-primary)" }}>{h.cycleLength} months</span></div>}
                                {h.readyToMate && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Ready to mate: <span style={{ color: "#0F6E56", fontWeight: 500 }}>{formatDateRange(h.readyToMate, mateEnd)}</span></div>}
                                {h.matingDate && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Mating date: <span style={{ color: "#534AB7", fontWeight: 500 }}>{formatDate(h.matingDate)}</span></div>}
                                {h.expectedWhelp && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Expected whelp: <span style={{ color: "var(--color-text-primary)" }}>{formatDateRange(whelpFrom, whelpTo)}</span></div>}
                                {h.actualWhelp && <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Actual whelp: <span style={{ color: "#1D9E75", fontWeight: 500 }}>{formatDate(h.actualWhelp)}</span></div>}
                              </div>
                              {h.notes && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>📝 {h.notes}</div>}
                            </div>
                            <button onClick={() => updateDog("heatRecords", activeDog.heatRecords.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 16, marginLeft: 8 }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {showAddHeat ? (
                    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {activeDog.breed && activeDog.breed !== "Other" && (
                        <div style={{ background: "#EEEDFE", borderRadius: "var(--border-radius-md)", padding: "8px 12px", fontSize: 12, color: "#3C3489" }}>
                          🐾 <strong>{activeDog.breed}</strong> — optimal mating window: day {getMatingWindow(activeDog.breed).from}–{getMatingWindow(activeDog.breed).to} after first heat · gestation: 63 days
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Heat Cycle</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>{lbl("Last Heat Date")}
                          <input type="date" value={newHeat.lastHeat} onChange={e => {
                            const val = e.target.value;
                            const w = getMatingWindow(activeDog.breed);
                            setNewHeat(p => ({ ...p, lastHeat: val, readyToMate: val ? addDays(val, w.from) : p.readyToMate }));
                          }} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
                        </div>
                        <div>{lbl("Next Heat (estimated)")}{inp(newHeat.nextHeat, v => setNewHeat(p => ({ ...p, nextHeat: v })), "", "date")}</div>
                        <div>{lbl("Cycle Length (months)")}{inp(newHeat.cycleLength, v => setNewHeat(p => ({ ...p, cycleLength: v })), "6")}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Mating</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>{lbl("Ready to Mate (estimated)")}
                          {autoInp(newHeat.readyToMate, v => setNewHeat(p => ({ ...p, readyToMate: v })),
                            newHeat.lastHeat ? `Window: ${formatDateRange(addDays(newHeat.lastHeat, getMatingWindow(activeDog.breed).from), addDays(newHeat.lastHeat, getMatingWindow(activeDog.breed).to))} (day ${getMatingWindow(activeDog.breed).from}–${getMatingWindow(activeDog.breed).to})` : ""
                          )}
                        </div>
                        <div>{lbl("Successful Mating Date")}
                          <input type="date" value={newHeat.matingDate} onChange={e => {
                            const val = e.target.value;
                            setNewHeat(p => ({ ...p, matingDate: val, expectedWhelp: val ? addDays(val, 63) : p.expectedWhelp }));
                          }} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>Whelping</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>{lbl("Expected Whelp Date")}
                          {autoInp(newHeat.expectedWhelp, v => setNewHeat(p => ({ ...p, expectedWhelp: v })),
                            newHeat.matingDate ? `Range: ${formatDateRange(addDays(newHeat.matingDate, 63 - WHELP_TOLERANCE), addDays(newHeat.matingDate, 63 + WHELP_TOLERANCE))} (63 ± ${WHELP_TOLERANCE} days)` : ""
                          )}
                        </div>
                        <div>{lbl("Actual Whelp Date")}{inp(newHeat.actualWhelp, v => setNewHeat(p => ({ ...p, actualWhelp: v })), "", "date")}</div>
                      </div>
                      <div>{lbl("Notes")}{inp(newHeat.notes, v => setNewHeat(p => ({ ...p, notes: v })), "Behaviour, discharge, duration...")}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { if (!newHeat.lastHeat) return; updateDog("heatRecords", [{ id: genId(), ...newHeat }, ...activeDog.heatRecords]); setNewHeat({ lastHeat: "", nextHeat: "", cycleLength: "", notes: "", readyToMate: "", matingDate: "", expectedWhelp: "", actualWhelp: "" }); setShowAddHeat(false); }} style={{ flex: 1, padding: "8px", borderRadius: "var(--border-radius-md)", border: "none", background: "#534AB7", color: "#fff", fontSize: 13, cursor: "pointer" }}>Add Record</button>
                        <button onClick={() => setShowAddHeat(false)} style={{ flex: 1, padding: "8px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddHeat(true)} style={{ width: "100%", padding: "10px", borderRadius: "var(--border-radius-md)", border: "1.5px dashed var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>+ Add Heat Cycle Record</button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab: Gallery */}
          {tab === "gallery" && (
            <div>
              <input ref={galleryRef} type="file" accept="image/*,video/*" multiple onChange={handleGallery} style={{ display: "none" }} />
              <button onClick={() => galleryRef.current?.click()} style={{ width: "100%", padding: "10px", borderRadius: "var(--border-radius-md)", border: "1.5px dashed var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", marginBottom: 14 }}>+ Upload Photos / Videos</button>
              {activeDog.gallery.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>No photos or videos yet</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {activeDog.gallery.map(item => (
                  <div key={item.id} style={{ position: "relative", aspectRatio: "1", borderRadius: "var(--border-radius-md)", overflow: "hidden", background: "var(--color-background-secondary)", cursor: "pointer" }} onClick={() => setLightbox(item)}>
                    {item.type === "image" ? <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 28 }}>▶️</span><span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Video</span></div>}
                    <button onClick={e => { e.stopPropagation(); removeGallery(item.id); }} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer" }}>✕</button>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", padding: "3px 6px" }}>
                      <div style={{ fontSize: 10, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Documents */}
          {tab === "docs" && (
            <div>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>{lbl("Document Name")}{inp(newDoc.name, v => setNewDoc(p => ({ ...p, name: v })), "File name...")}</div>
                  <div>{lbl("Document Type")}
                    <select value={newDoc.docType} onChange={e => setNewDoc(p => ({ ...p, docType: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }}>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleDoc} style={{ display: "none" }} />
                <button onClick={() => docRef.current?.click()} style={{ width: "100%", padding: "10px", borderRadius: "var(--border-radius-md)", border: "1.5px dashed var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>📎 Choose File (PDF, Word, Image)</button>
              </div>
              {activeDog.documents.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>No documents uploaded yet</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeDog.documents.map(doc => (
                  <div key={doc.id} style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{docIcon(doc.fileType)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{doc.docType} · {doc.date}</div>
                    </div>
                    <a href={doc.url} download={doc.name} style={{ fontSize: 18, textDecoration: "none", flexShrink: 0 }}>⬇️</a>
                    <button onClick={() => removeDoc(doc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 16, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Reminders */}
          {tab === "reminders" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Alerts for <strong>{activeDog.name || "this dog"}</strong></div>
                <button onClick={() => setShowReminderSettings(!showReminderSettings)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: "var(--border-radius-md)", border: "1px solid var(--color-border-secondary)", background: showReminderSettings ? "#EEEDFE" : "var(--color-background-primary)", color: showReminderSettings ? "#3C3489" : "var(--color-text-secondary)", cursor: "pointer" }}>⚙️ Settings</button>
              </div>
              {showReminderSettings && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>💉 Vaccine reminder window</div>
                      {REMINDER_OPTIONS.map(opt => (
                        <label key={opt.days} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                          <div onClick={() => setVaccineReminder(opt)} style={{ width: 16, height: 16, borderRadius: "50%", border: vaccineReminder.days === opt.days ? "none" : "2px solid var(--color-border-secondary)", background: vaccineReminder.days === opt.days ? "#534AB7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                            {vaccineReminder.days === opt.days && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          <span style={{ fontSize: 13, color: vaccineReminder.days === opt.days ? "#3C3489" : "var(--color-text-primary)" }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>🌡️ Heat cycle reminder window</div>
                      {REMINDER_OPTIONS.map(opt => (
                        <label key={opt.days} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                          <div onClick={() => setHeatReminder(opt)} style={{ width: 16, height: 16, borderRadius: "50%", border: heatReminder.days === opt.days ? "none" : "2px solid var(--color-border-secondary)", background: heatReminder.days === opt.days ? "#534AB7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                            {heatReminder.days === opt.days && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          <span style={{ fontSize: 13, color: heatReminder.days === opt.days ? "#3C3489" : "var(--color-text-primary)" }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {reminderCount === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>All clear!</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No upcoming reminders within the selected window.</div>
                </div>
              )}
              {vaccineAlerts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>💉 Vaccine Alerts</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {vaccineAlerts.sort((a, b) => a.daysLeft - b.daysLeft).map((a, i) => {
                      const c = urgencyColor(a.daysLeft);
                      return (
                        <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{a.name} vaccine</div>
                            <div style={{ fontSize: 11, color: c.text, opacity: 0.8, marginTop: 2 }}>Due: {formatDate(a.dueDate)}</div>
                          </div>
                          <span style={{ background: c.badge, color: "#fff", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 99 }}>{urgencyLabel(a.daysLeft)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {heatAlerts.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>🌡️ Heat Cycle Alerts</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {heatAlerts.sort((a, b) => a.daysLeft - b.daysLeft).map((a, i) => {
                      const c = urgencyColor(a.daysLeft);
                      return (
                        <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: c.text }}>Heat cycle expected</div>
                            {a.notes && <div style={{ fontSize: 11, color: c.text, opacity: 0.8, marginTop: 1 }}>{a.notes}</div>}
                            <div style={{ fontSize: 11, color: c.text, opacity: 0.8, marginTop: 2 }}>Expected: {formatDate(a.nextHeat)}</div>
                          </div>
                          <span style={{ background: c.badge, color: "#fff", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 99 }}>{urgencyLabel(a.daysLeft)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save */}
          <button onClick={() => setSaved(true)} style={{ marginTop: 14, width: "100%", padding: "11px", borderRadius: "var(--border-radius-md)", border: "none", background: saved ? "#1D9E75" : "#534AB7", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "background 0.2s" }}>
            {saved ? "✓ Profile Saved" : "💾 Save Profile"}
          </button>
          <button onClick={() => saveToFirebase(dogs)} disabled={syncing} style={{ marginTop: 8, width: "100%", padding: "11px", borderRadius: "var(--border-radius-md)", border: "none", background: syncing ? "#888" : "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            {syncing ? "Saving..." : "☁️ Sync to Firebase"}
          </button>
          </button>
      )}
    </div>
  );
}