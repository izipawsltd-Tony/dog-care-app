import { useState, useRef } from "react";

interface ExtractedData {
  name?: string;
  breed?: string;
  dob?: string;
  gender?: string;
  microchip?: string;
  colour?: string;
  weight?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  ownerAddress?: string;
  vaccines?: { name: string; date: string; nextDate?: string }[];
  worming?: { name: string; date: string; nextDate?: string }[];
  notes?: string;
}

interface DocScannerProps {
  onExtracted: (data: ExtractedData) => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Dog Name", breed: "Breed", dob: "Date of Birth", gender: "Gender",
  microchip: "Microchip No.", colour: "Colour", weight: "Weight",
  ownerName: "Owner Name", ownerPhone: "Owner Phone",
  ownerEmail: "Owner Email", ownerAddress: "Owner Address", notes: "Notes",
};

export default function DocScanner({ onExtracted, onClose }: DocScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError("");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview("");
    }
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError("");
    try {
      const toBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res((ev.target?.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(f);
      });

      const base64 = await toBase64(file);
      const isImage = file.type.startsWith("image/");
      const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

      const prompt = `You are extracting dog/pet information from a document or image. Extract ALL available information and return ONLY valid JSON with no markdown, no explanation.

Return this exact JSON structure (use null for missing fields, empty array [] for missing arrays):
{
  "name": "dog's name or call name",
  "breed": "breed name",
  "dob": "date in YYYY-MM-DD format",
  "gender": "Male or Female",
  "microchip": "microchip number",
  "colour": "coat colour",
  "weight": "weight in kg as number string",
  "ownerName": "owner full name",
  "ownerPhone": "owner phone",
  "ownerEmail": "owner email",
  "ownerAddress": "owner address",
  "vaccines": [{"name": "vaccine name", "date": "YYYY-MM-DD", "nextDate": "YYYY-MM-DD or null"}],
  "worming": [{"name": "product name", "date": "YYYY-MM-DD", "nextDate": "YYYY-MM-DD or null"}],
  "notes": "any other relevant notes"
}

Important: Convert all dates to YYYY-MM-DD format. If a date is like "15/06/2024" convert to "2024-06-15".`;

      const body: any = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            isImage
              ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
              : { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt }
          ]
        }]
      };

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed: ExtractedData = JSON.parse(clean);

      // Filter out null values
      Object.keys(parsed).forEach(k => {
        const key = k as keyof ExtractedData;
        if (parsed[key] === null || parsed[key] === undefined) delete parsed[key];
        if (Array.isArray(parsed[key]) && (parsed[key] as any[]).length === 0) delete parsed[key];
      });

      setResult(parsed);
    } catch (e) {
      console.error(e);
      setError("Could not read document. Please try a clearer image or PDF.");
    }
    setScanning(false);
  };

  const applyData = () => {
    if (!result) return;
    setApplying(true);
    onExtracted(result);
    setTimeout(() => { setApplying(false); onClose(); }, 500);
  };

  const IS: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "7px 10px",
    borderRadius: 6, border: "1px solid #ddd",
    fontSize: 13, outline: "none", background: "#fafafa",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>🔍 AI Document Scanner</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Upload ảnh hoặc PDF — AI tự điền thông tin</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {/* Upload */}
        <div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} style={{ display: "none" }} />
          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: "2px dashed #534AB7", borderRadius: 12, padding: "20px", textAlign: "center", cursor: "pointer", background: file ? "#EEEDFE" : "#fafafa", transition: "background 0.2s" }}
          >
            {file ? (
              <div>
                {preview && <img src={preview} alt="" style={{ maxHeight: 160, borderRadius: 8, marginBottom: 8, objectFit: "contain" }} />}
                <div style={{ fontSize: 13, fontWeight: 500, color: "#3C3489" }}>📄 {file.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Click to change file</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#534AB7" }}>Click to upload image or PDF</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Vaccination card, registration cert, health record...</div>
              </div>
            )}
          </div>
        </div>

        {/* Scan button */}
        {file && !result && (
          <button
            onClick={scan}
            disabled={scanning}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: scanning ? "#888" : "#534AB7", color: "#fff", fontSize: 14, fontWeight: 600, cursor: scanning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {scanning ? (
              <>
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
                AI đang đọc document...
              </>
            ) : "🔍 Scan & Extract Information"}
          </button>
        )}

        {error && (
          <div style={{ background: "#FCEBEB", border: "1px solid #F09595", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#A32D2D" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#E1F5EE", border: "1px solid #5DCAA5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0F6E56", fontWeight: 500 }}>
              ✅ Tìm thấy thông tin! Kiểm tra và chỉnh sửa trước khi áp dụng.
            </div>

            {/* Basic info */}
            {Object.entries(result).filter(([k]) => !["vaccines", "worming", "notes"].includes(k) && result[k as keyof ExtractedData]).length > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#534AB7", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>📋 Basic Information</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {Object.entries(result)
                    .filter(([k]) => !["vaccines", "worming", "notes"].includes(k) && result[k as keyof ExtractedData])
                    .map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{FIELD_LABELS[k] || k}</div>
                        <input
                          value={v as string}
                          onChange={e => setResult(prev => prev ? { ...prev, [k]: e.target.value } : prev)}
                          style={IS}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Vaccines */}
            {result.vaccines && result.vaccines.length > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#534AB7", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>💉 Vaccine Records ({result.vaccines.length})</div>
                {result.vaccines.map((v, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 6, border: "1px solid #eee" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Vaccine</div>
                        <input value={v.name} onChange={e => { const vx = [...result.vaccines!]; vx[i] = { ...vx[i], name: e.target.value }; setResult(p => p ? { ...p, vaccines: vx } : p); }} style={IS} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Date Given</div>
                        <input value={v.date} onChange={e => { const vx = [...result.vaccines!]; vx[i] = { ...vx[i], date: e.target.value }; setResult(p => p ? { ...p, vaccines: vx } : p); }} style={IS} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Next Due</div>
                        <input value={v.nextDate || ""} onChange={e => { const vx = [...result.vaccines!]; vx[i] = { ...vx[i], nextDate: e.target.value }; setResult(p => p ? { ...p, vaccines: vx } : p); }} style={IS} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Worming */}
            {result.worming && result.worming.length > 0 && (
              <div style={{ background: "#f8f8f8", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#534AB7", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>🐛 Worming Records ({result.worming.length})</div>
                {result.worming.map((w, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 6, border: "1px solid #eee" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Product</div>
                        <input value={w.name} onChange={e => { const wx = [...result.worming!]; wx[i] = { ...wx[i], name: e.target.value }; setResult(p => p ? { ...p, worming: wx } : p); }} style={IS} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Date Given</div>
                        <input value={w.date} onChange={e => { const wx = [...result.worming!]; wx[i] = { ...wx[i], date: e.target.value }; setResult(p => p ? { ...p, worming: wx } : p); }} style={IS} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Next Due</div>
                        <input value={w.nextDate || ""} onChange={e => { const wx = [...result.worming!]; wx[i] = { ...wx[i], nextDate: e.target.value }; setResult(p => p ? { ...p, worming: wx } : p); }} style={IS} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {result.notes && (
              <div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Notes</div>
                <textarea value={result.notes} onChange={e => setResult(p => p ? { ...p, notes: e.target.value } : p)} rows={2} style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} />
              </div>
            )}

            {/* Apply button */}
            <button
              onClick={applyData}
              disabled={applying}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: applying ? "#1D9E75" : "#534AB7", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              {applying ? "✓ Applied!" : "✅ Apply to Dog Profile"}
            </button>
          </div>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}