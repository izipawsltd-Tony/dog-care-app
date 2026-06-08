import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import emailjs from "@emailjs/browser";
import DogJournal from "./DogJournal";
import DogProfile from "./DogProfile";
import LittersPage, { PuppyShareView } from "./LittersPage";
import Login from "./Login";

const REMINDER_OPTIONS = [
  { label: "7 days before", days: 7 },
  { label: "14 days before", days: 14 },
  { label: "1 month before", days: 30 },
  { label: "2 months before", days: 60 },
  { label: "3 months before", days: 90 },
];

const DEFAULT_STAFF = ["Staff 1", "Staff 2", "Staff 3"];

const daysUntil = (dateStr: string) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
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

export default function App() {
  const [page, setPage] = useState<"journal" | "profile" | "litters" | "reminders" | "settings">("journal");
  const [staffNames, setStaffNames] = useState<string[]>(DEFAULT_STAFF);
  const [saved, setSaved] = useState(false);
  const [dogs, setDogs] = useState<any[]>([]);
  const [vaccineReminder, setVaccineReminder] = useState(REMINDER_OPTIONS[0]);
  const [heatReminder, setHeatReminder] = useState(REMINDER_OPTIONS[2]);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const [filterKennel, setFilterKennel] = useState("All");
  const [filterType, setFilterType] = useState<"all" | "vaccine" | "heat">("all");
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)" }}>

      {/* Sidebar */}
      <div style={{ width: 200, background: "#1a1a2e", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        {/* Logo */}
        <div style={{ padding: "16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <img src="/izipaws-logo-transparent.svg" alt="IziPaws" style={{ width: "100%", maxWidth: 140, height: "auto" }}/>
        </div>

        {/* Nav items */}
        <nav style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV.map(n => (
            <button key={n.k} onClick={() => setPage(n.k as any)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", borderRadius: 8, border: "none",
              background: page === n.k ? "rgba(83,74,183,0.85)" : "transparent",
              color: page === n.k ? "#fff" : "rgba(255,255,255,0.5)",
              fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%",
              fontWeight: page === n.k ? 500 : 400,
              transition: "background 0.15s",
            }}>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", width: "100%" }}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-background-primary)" }}>
        {page === "journal" && <DogJournal staffNames={staffNames} />}
        {page === "profile" && <DogProfile />}
        {page === "litters" && <LittersPage />}

        {/* Reminders */}
        {page === "reminders" && (
          <div style={{ fontFamily: "sans-serif", maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Reminders</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 500 }}>Upcoming Alerts</span>
                  {totalAlerts > 0 && <span style={{ background: "#E24B4A", color: "#fff", borderRadius: 99, fontSize: 12, fontWeight: 500, padding: "2px 8px" }}>{totalAlerts}</span>}
                </div>
              </div>
              <button onClick={() => setShowReminderSettings(!showReminderSettings)} style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid #ddd", background: showReminderSettings ? "#EEEDFE" : "#fff", color: showReminderSettings ? "#3C3489" : "#666", fontSize: 13, cursor: "pointer" }}>⚙️ Settings</button>
            </div>

            {showReminderSettings && (
              <div style={{ background: "#f8f8f8", borderRadius: 12, padding: "14px", marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[{ label: "💉 Vaccine reminder", state: vaccineReminder, set: setVaccineReminder }, { label: "🌡️ Heat cycle reminder", state: heatReminder, set: setHeatReminder }].map(({ label, state, set }) => (
                    <div key={label}>
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{label}</div>
                      {REMINDER_OPTIONS.map(opt => (
                        <label key={opt.days} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                          <div onClick={() => set(opt)} style={{ width: 16, height: 16, borderRadius: "50%", border: state.days === opt.days ? "none" : "2px solid #ccc", background: state.days === opt.days ? "#534AB7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            {state.days === opt.days && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          <span style={{ fontSize: 13 }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <select value={filterKennel} onChange={e => setFilterKennel(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, outline: "none" }}>
                <option value="All">All Kennels</option>
                {KENNELS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              {["all", "vaccine", "heat"].map(t => (
                <button key={t} onClick={() => setFilterType(t as any)} style={{ padding: "6px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer", border: filterType === t ? "1.5px solid #534AB7" : "1.5px solid #ddd", background: filterType === t ? "#EEEDFE" : "#fff", color: filterType === t ? "#3C3489" : "#666" }}>
                  {t === "all" ? "All" : t === "vaccine" ? `💉 Vaccines (${vaccineAlerts.length})` : `🌡️ Heat (${heatAlerts.length})`}
                </button>
              ))}
            </div>

            {totalAlerts === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>All clear!</div>
                <div style={{ fontSize: 13, color: "#999" }}>No reminders within the selected timeframe.</div>
              </div>
            )}

            {filterType !== "heat" && vaccineAlerts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>💉 Vaccine Alerts</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {vaccineAlerts.sort((a, b) => a.daysLeft - b.daysLeft).map((a, i) => {
                    const c = urgencyColor(a.daysLeft);
                    return (
                      <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 22 }}>💉</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 14, color: c.text }}>{a.dogName}</span>
                            <span style={{ fontSize: 11, background: "rgba(0,0,0,0.08)", color: c.text, padding: "1px 7px", borderRadius: 99 }}>{a.kennel}</span>
                          </div>
                          <div style={{ fontSize: 13, color: c.text }}>{a.name} vaccine due</div>
                          <div style={{ fontSize: 11, color: c.text, opacity: 0.8, marginTop: 2 }}>Due: {formatDate(a.dueDate)}</div>
                        </div>
                        <span style={{ background: c.badge, color: "#fff", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 99 }}>{urgencyLabel(a.daysLeft)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filterType !== "vaccine" && heatAlerts.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>🌡️ Heat Cycle Alerts</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {heatAlerts.sort((a, b) => a.daysLeft - b.daysLeft).map((a, i) => {
                    const c = urgencyColor(a.daysLeft);
                    return (
                      <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 22 }}>🌡️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 14, color: c.text }}>{a.dogName}</span>
                            <span style={{ fontSize: 11, background: "rgba(0,0,0,0.08)", color: c.text, padding: "1px 7px", borderRadius: 99 }}>{a.kennel}</span>
                          </div>
                          <div style={{ fontSize: 13, color: c.text }}>Heat cycle expected{a.notes ? ` · ${a.notes}` : ""}</div>
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

        {/* Settings */}
        {page === "settings" && (
          <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
            <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Settings</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 20 }}>Staff Management</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {staffNames.map((name, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#3C3489", flexShrink: 0 }}>{i + 1}</div>
                  <input value={name} onChange={e => { const u = [...staffNames]; u[i] = e.target.value; setStaffNames(u); setSaved(false); }} placeholder={`Staff ${i + 1} name...`} style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, outline: "none" }} />
                  {staffNames.length > 1 && <button onClick={() => { setStaffNames(staffNames.filter((_, j) => j !== i)); setSaved(false); }} style={{ background: "none", border: "1px solid #F09595", borderRadius: 6, cursor: "pointer", color: "#E24B4A", fontSize: 12, padding: "6px 10px" }}>Remove</button>}
                </div>
              ))}
            </div>
            <button onClick={() => { setStaffNames([...staffNames, ""]); setSaved(false); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1.5px dashed #ccc", background: "#fff", color: "#666", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>+ Add Staff Member</button>
            <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: saved ? "#1D9E75" : "#534AB7", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>{saved ? "✓ Saved" : "💾 Save Staff Names"}</button>
          </div>
        )}
      </div>
    </div>
  );
}