import { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login"|"reset">("login");
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter email and password."); return; }
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      setError("Invalid email or password. Please try again.");
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!email) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (e: any) {
      setError("Email not found. Please check and try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/izipaws-logo-transparent.svg" alt="IziPaws" style={{ width: 200, height: "auto", marginBottom: 4 }}/>
        </div>

        {mode === "login" ? (
          /* LOGIN FORM */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Email</div>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="your@email.com"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e0e0e0", fontSize: 14, outline: "none" }}
                onFocus={e => e.target.style.border = "1.5px solid #534AB7"}
                onBlur={e => e.target.style.border = "1.5px solid #e0e0e0"}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Password</div>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e0e0e0", fontSize: 14, outline: "none" }}
                onFocus={e => e.target.style.border = "1.5px solid #534AB7"}
                onBlur={e => e.target.style.border = "1.5px solid #e0e0e0"}
              />
            </div>

            {error && (
              <div style={{ background: "#FCEBEB", border: "1px solid #F09595", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#A32D2D" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin} disabled={loading}
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: loading ? "#888" : "#534AB7", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => { setMode("reset"); setError(""); setResetSent(false); }}
                style={{ background: "none", border: "none", color: "#534AB7", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
              >
                Forgot Password?
              </button>
            </div>
          </div>
        ) : (
          /* RESET FORM */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>Reset Password</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Enter your email to receive a reset link</div>
            </div>

            {resetSent ? (
              <div style={{ background: "#E1F5EE", border: "1px solid #5DCAA5", borderRadius: 8, padding: "14px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#0F6E56" }}>Reset email sent!</div>
                <div style={{ fontSize: 13, color: "#0F6E56", marginTop: 4 }}>Check your inbox and follow the link to reset your password.</div>
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Email</div>
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleReset()}
                    placeholder="your@email.com"
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e0e0e0", fontSize: 14, outline: "none" }}
                    onFocus={e => e.target.style.border = "1.5px solid #534AB7"}
                    onBlur={e => e.target.style.border = "1.5px solid #e0e0e0"}
                  />
                </div>

                {error && (
                  <div style={{ background: "#FCEBEB", border: "1px solid #F09595", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#A32D2D" }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleReset} disabled={loading}
                  style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: loading ? "#888" : "#534AB7", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </>
            )}

            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => { setMode("login"); setError(""); setResetSent(false); }}
                style={{ background: "none", border: "none", color: "#534AB7", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
              >
                ← Back to Sign In
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 12, color: "#aaa", marginTop: 24 }}>
          IziPaws Dog Care · Secure Login
        </div>
      </div>
    </div>
  );
}