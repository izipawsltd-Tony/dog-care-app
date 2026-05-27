import { useState } from "react";
import DogJournal from "./DogJournal";
import DogProfile from "./DogProfile";

function App() {
  const [page, setPage] = useState<"journal" | "profile">("journal");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e5e5", background: "#fff", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => setPage("journal")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: page === "journal" ? "2px solid #534AB7" : "1px solid #ddd", background: page === "journal" ? "#EEEDFE" : "#fff", cursor: "pointer", fontWeight: page === "journal" ? 600 : 400, fontSize: 13, color: page === "journal" ? "#3C3489" : "#666" }}>
          📋 Daily Journal
        </button>
        <button onClick={() => setPage("profile")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: page === "profile" ? "2px solid #534AB7" : "1px solid #ddd", background: page === "profile" ? "#EEEDFE" : "#fff", cursor: "pointer", fontWeight: page === "profile" ? 600 : 400, fontSize: 13, color: page === "profile" ? "#3C3489" : "#666" }}>
          🐶 Dog Profiles
        </button>
      </div>
      {page === "journal" ? <DogJournal /> : <DogProfile />}
    </div>
  );
}

export default DogProfile;