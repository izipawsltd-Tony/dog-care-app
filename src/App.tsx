import { useState } from "react";
import DogJournal from "./DogJournal";
import DogProfile from "./DogProfile";

const DEFAULT_STAFF = ["Staff 1", "Staff 2", "Staff 3"];

export default function App() {
  const [page, setPage] = useState<"journal" | "profile" | "settings">("journal");
  const [staffNames, setStaffNames] = useState<string[]>(DEFAULT_STAFF);
  const [saved, setSaved] = useState(false);

  return (
    <div>
      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e5e5", background: "#fff", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => setPage("journal")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: page === "journal" ? "2px solid #534AB7" : "1px solid #ddd", background: page === "journal" ? "#EEEDFE" : "#fff", cursor: "pointer", fontWeight: page === "journal" ? 600 : 400, fontSize: 13, color: page === "journal" ? "#3C3489" : "#666" }}>
          📋 Daily Journal
        </button>
        <button onClick={() => setPage("profile")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: page === "profile" ? "2px solid #534AB7" : "1px solid #ddd", background: page === "profile" ? "#EEEDFE" : "#fff", cursor: "pointer", fontWeight: page === "profile" ? 600 : 400, fontSize: 13, color: page === "profile" ? "#3C3489" : "#666" }}>
          🐶 Dog Profiles
        </button>
        <button onClick={() => setPage("settings")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: page === "settings" ? "2px solid #534AB7" : "1px solid #ddd", background: page === "settings" ? "#EEEDFE" : "#fff", cursor: "pointer", fontWeight: page === "settings" ? 600 : 400, fontSize: 13, color: page === "settings" ? "#3C3489" : "#666" }}>
          ⚙️ Settings
        </button>
      </div>

      {/* Pages */}
      {page === "journal" && <DogJournal staffNames={staffNames} />}
      {page === "profile" && <DogProfile />}
      {page === "settings" && (
        <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Settings</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 20 }}>Staff Management</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {staffNames.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#3C3489", flexShrink: 0 }}>
                  {i + 1}
                </div>
                <input
                  value={name}
                  onChange={e => {
                    const updated = [...staffNames];
                    updated[i] = e.target.value;
                    setStaffNames(updated);
                    setSaved(false);
                  }}
                  placeholder={`Staff ${i + 1} name...`}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, outline: "none" }}
                />
                {staffNames.length > 1 && (
                  <button onClick={() => { setStaffNames(staffNames.filter((_, j) => j !== i)); setSaved(false); }}
                    style={{ background: "none", border: "1px solid #F09595", borderRadius: 6, cursor: "pointer", color: "#E24B4A", fontSize: 12, padding: "6px 10px" }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => { setStaffNames([...staffNames, ""]); setSaved(false); }}
            style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1.5px dashed #ccc", background: "#fff", color: "#666", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
            + Add Staff Member
          </button>

          <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: saved ? "#1D9E75" : "#534AB7", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "background 0.2s" }}>
            {saved ? "✓ Saved" : "💾 Save Staff Names"}
          </button>
        </div>
      )}
    </div>
  );
}