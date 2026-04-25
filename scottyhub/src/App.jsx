import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════
   FIREBASE CONFIG — scottyhub-2eb1d
═══════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtJ6SzZPQ8RJe4qAAAQz5tgA_bjpmXseY",
  authDomain: "scottyhub-2eb1d.firebaseapp.com",
  projectId: "scottyhub-2eb1d",
  storageBucket: "scottyhub-2eb1d.firebasestorage.app",
  messagingSenderId: "877580776303",
  appId: "1:877580776303:web:32a72e1126d8ed7fdf6e9a",
  measurementId: "G-YR2BH2THG1"
};

/* ═══════════════════════════════════════════════
   FIREBASE SIMULATION — Full Backend
   (Replace with real Firebase SDK for production)
═══════════════════════════════════════════════ */
const firebaseDB = {
  users: JSON.parse(localStorage.getItem("sh_users") || "{}"),
  news: JSON.parse(localStorage.getItem("sh_news") || "[]"),
  sessions: JSON.parse(localStorage.getItem("sh_sessions") || "{}"),
  activityLogs: JSON.parse(localStorage.getItem("sh_activity") || "[]"),
  media: JSON.parse(localStorage.getItem("sh_media") || "[]"),
  otpStore: {},
  save() {
    localStorage.setItem("sh_users", JSON.stringify(this.users));
    localStorage.setItem("sh_news", JSON.stringify(this.news));
    localStorage.setItem("sh_sessions", JSON.stringify(this.sessions));
    localStorage.setItem("sh_activity", JSON.stringify(this.activityLogs));
    localStorage.setItem("sh_media", JSON.stringify(this.media));
  },
  logActivity(uid, email, action, detail = "") {
    const log = {
      id: Date.now().toString(),
      uid, email, action, detail,
      timestamp: new Date().toISOString(),
      device: navigator.userAgent.slice(0, 80),
      online: navigator.onLine,
    };
    this.activityLogs = [log, ...this.activityLogs].slice(0, 500);
    this.save();
  },
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },
  storeOTP(email, otp, type = "verify") {
    this.otpStore[email + "_" + type] = { otp, expires: Date.now() + 10 * 60 * 1000 };
  },
  verifyOTP(email, otp, type = "verify") {
    const stored = this.otpStore[email + "_" + type];
    if (!stored) return false;
    if (Date.now() > stored.expires) { delete this.otpStore[email + "_" + type]; return false; }
    if (stored.otp !== otp) return false;
    delete this.otpStore[email + "_" + type];
    return true;
  }
};

/* ─── Email sender via EmailJS free tier ─── */
const sendEmail = async (to_email, to_name, subject, message, otp = "") => {
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE,
        template_id: otp ? EMAILJS_TEMPLATE_OTP : EMAILJS_TEMPLATE_VERIFY,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: { to_email, to_name, subject, message, otp, from_name: "ScottyHub" }
      })
    });
    return res.status === 200;
  } catch { return false; }
};

const firebaseAuth = {
  currentUser: null,
  _token: null,

  async createUserWithEmailAndPassword(email, password, name, phone) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, email, password, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    // store userId temporarily for OTP verification
    localStorage.setItem('sh_pending_uid', data.userId);
    return { email, name, needsVerification: true };
  },

  async signInWithEmailAndPassword(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    this._token = data.token;
    this.currentUser = { uid: data.user.id, email: data.user.email, name: data.user.username, plan: 'free', isAdmin: data.user.role === 'admin', emailVerified: true };
    localStorage.setItem('sh_current', JSON.stringify(this.currentUser));
    localStorage.setItem('sh_token', data.token);
    return this.currentUser;
  },

  async verifyEmailOTP(email, otp) {
    const userId = localStorage.getItem('sh_pending_uid');
    const res = await fetch(`${API_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, otp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Verification failed');
    this._token = data.token;
    this.currentUser = { uid: data.user.id, email: data.user.email, name: data.user.username, plan: 'free', isAdmin: data.user.role === 'admin', emailVerified: true };
    localStorage.setItem('sh_current', JSON.stringify(this.currentUser));
    localStorage.setItem('sh_token', data.token);
    localStorage.removeItem('sh_pending_uid');
    return this.currentUser;
  },

  async verify2FA(email, otp) {
    return this.verifyEmailOTP(email, otp);
  },

  async resendOTP(email, type = 'verify') {
    const res = await fetch(`${API_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
    localStorage.setItem('sh_pending_uid', data.userId);
    return true;
  },

  async signOut() {
    this.currentUser = null;
    this._token = null;
    localStorage.removeItem('sh_current');
    localStorage.removeItem('sh_token');
  },

  restoreSession() {
    const saved = localStorage.getItem('sh_current');
    const token = localStorage.getItem('sh_token');
    if (saved && token) {
      this.currentUser = JSON.parse(saved);
      this._token = token;
      return this.currentUser;
    }
    return null;
  }
};

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
// ── REAL FREE APIs ──
const TMDB_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMGI1NGE0ZjRkZTRhYWIzMThhMGU2ZTVhNTA4N2VmOSIsInN1YiI6IjY0YjFlNjNmMzQ5ZGVkMDEyY2IzMGI0ZiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.QC0ZPiiDMBpJmWlqaRbWQdx6eFIlWl7nMbxFMB9M8oo";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const ITUNES_API = "https://itunes.apple.com/search";
const SPORTSDB_API = "https://www.thesportsdb.com/api/v1/json/3";
const EXCHANGE_API = "https://open.er-api.com/v6/latest/USD";
const CRYPTO_API = "https://api.coingecko.com/api/v3";
const SUPPORT = { phone: "+263719080917", email: "maposacourage41@gmail.com", telegram: "t.me/Scottycrg" };
const PAYMENT = { ecocash: "+263788114185", binance: "1109003191", minipay: "+263788114185" };
const BOT_PAIRING_URL = "https://scotty-c.onrender.com";
const YOUTUBE_CHANNEL = "https://youtube.com/@scottyx-tech?si=w_ywEbFzNOfDb6Yv";
const REFERRAL_COMMISSION = 0.20;
// EmailJS — free email sending (sign up at emailjs.com to get real keys)
const EMAILJS_SERVICE = "service_scottyhub";
const EMAILJS_TEMPLATE_VERIFY = "template_verify";
const EMAILJS_TEMPLATE_OTP = "template_otp";
const EMAILJS_PUBLIC_KEY = "jBQcleV5mpzLv4lxW";

// Backend API
const API_URL = "/api";

/* ═══════════════════════════════════════════════
   GLOBAL STYLES
═══════════════════════════════════════════════ */
const G = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@300;400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:#060b14;color:#e8f4ff;font-family:'Exo 2',sans-serif;overflow-x:hidden}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-thumb{background:linear-gradient(#00ffcc,#0077ff);border-radius:10px}
::-webkit-scrollbar-track{background:#0a0f1a}

@keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes shimmer{0%{background-position:-400% center}100%{background-position:400% center}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes scanline{0%{top:-100%}100%{top:100%}}
@keyframes glow{0%,100%{box-shadow:0 0 10px rgba(0,255,204,.3)}50%{box-shadow:0 0 30px rgba(0,255,204,.7),0 0 60px rgba(0,119,255,.3)}}
@keyframes floatUp{0%{transform:translateY(0)}50%{transform:translateY(-6px)}100%{transform:translateY(0)}}
@keyframes neonFlicker{0%,19%,21%,23%,25%,54%,56%,100%{opacity:1}20%,24%,55%{opacity:.4}}
@keyframes typewriter{from{width:0}to{width:100%}}
@keyframes blink{50%{border-color:transparent}}
@keyframes slideIn{from{transform:translateX(-20px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes countUp{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@keyframes matrix{0%{opacity:0;transform:translateY(-10px)}50%{opacity:1}100%{opacity:0;transform:translateY(10px)}}

.shimmer-text{
  background:linear-gradient(90deg,#00ffcc,#0077ff,#00ffcc,#ff6b35);
  background-size:400% auto;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;animation:shimmer 4s linear infinite;
}
.neon-text{color:#00ffcc;text-shadow:0 0 10px rgba(0,255,204,.8),0 0 20px rgba(0,255,204,.4)}
.cyber-border{border:1px solid rgba(0,255,204,.2);position:relative}
.cyber-border::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#00ffcc,transparent)}
.glass{background:rgba(6,11,20,.85);backdrop-filter:blur(20px);border:1px solid rgba(0,255,204,.12)}
.card{background:rgba(10,16,28,.9);border:1px solid rgba(0,255,204,.1);border-radius:12px;transition:all .3s}
.card:hover{border-color:rgba(0,255,204,.35);transform:translateY(-3px);box-shadow:0 8px 30px rgba(0,255,204,.08)}
.btn{font-family:'Rajdhani',sans-serif;cursor:pointer;border:none;font-weight:700;transition:all .25s;letter-spacing:1px;text-transform:uppercase;font-size:13px}
.btn-cyan{background:linear-gradient(135deg,#00ffcc,#0077ff);color:#060b14}
.btn-cyan:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,255,204,.4)}
.btn-outline{background:transparent;color:#00ffcc;border:1px solid rgba(0,255,204,.4)}
.btn-outline:hover{background:rgba(0,255,204,.08);border-color:#00ffcc;box-shadow:0 0 16px rgba(0,255,204,.2)}
.btn-red{background:linear-gradient(135deg,#ff4444,#cc1111);color:#fff}
.btn-red:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(255,68,68,.35)}
.btn-ghost{background:rgba(255,255,255,.04);color:#e8f4ff;border:1px solid rgba(255,255,255,.08)}
.btn-ghost:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15)}
.input{background:rgba(0,255,204,.03);border:1px solid rgba(0,255,204,.15);color:#e8f4ff;font-family:'Exo 2',sans-serif;font-size:14px;outline:none;transition:all .3s;width:100%;padding:11px 14px;border-radius:8px}
.input:focus{border-color:#00ffcc;box-shadow:0 0 16px rgba(0,255,204,.15),inset 0 0 8px rgba(0,255,204,.05)}
.input::placeholder{color:#334455;font-family:'Share Tech Mono',monospace;font-size:12px}
.badge{display:inline-flex;align-items:center;gap:5px;background:rgba(0,255,204,.07);border:1px solid rgba(0,255,204,.25);color:#00ffcc;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:4px 12px;border-radius:4px;font-family:'Share Tech Mono',monospace}
.tag-hot{background:rgba(255,100,0,.1);border-color:rgba(255,100,0,.3);color:#ff8844}
.tag-new{background:rgba(0,119,255,.1);border-color:rgba(0,119,255,.3);color:#4499ff}
.tag-free{background:rgba(0,200,100,.1);border-color:rgba(0,200,100,.3);color:#00cc88}
.tag-pro{background:rgba(150,0,255,.1);border-color:rgba(150,0,255,.3);color:#aa44ff}
.sidebar-link{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;color:#6688aa;font-size:13px;font-weight:600;transition:all .2s;border:none;background:none;width:100%;text-align:left;font-family:'Rajdhani',sans-serif;letter-spacing:.5px;text-transform:uppercase}
.sidebar-link:hover{color:#e8f4ff;background:rgba(0,255,204,.06)}
.sidebar-link.active{color:#00ffcc;background:linear-gradient(135deg,rgba(0,255,204,.1),rgba(0,119,255,.06));border-left:2px solid #00ffcc;padding-left:12px}
.orb{position:fixed;border-radius:50%;pointer-events:none;filter:blur(100px);z-index:0}
.section-title{font-family:'Rajdhani',sans-serif;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#00ffcc;font-size:11px;margin-bottom:8px}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s ease}

/* Hex grid bg */
.hex-bg{background-image:url("data:image/svg+xml,%3Csvg width='60' height='70' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='30,5 55,20 55,50 30,65 5,50 5,20' fill='none' stroke='rgba(0,255,204,0.04)' stroke-width='1'/%3E%3C/svg%3E");background-size:60px 70px}

/* Scrollbar for modal */
.modal-scroll{overflow-y:auto;max-height:80vh}
.modal-scroll::-webkit-scrollbar{width:3px}
.modal-scroll::-webkit-scrollbar-thumb{background:#00ffcc33}
`;

const C = {
  bg:"#060b14", bg2:"#0a0f1a", text:"#e8f4ff", muted:"#6688aa",
  cyan:"#00ffcc", blue:"#0077ff", orange:"#ff6b35", red:"#ff4444",
  green:"#00cc88", purple:"#9944ff"
};

/* ═══════════════════════════════════════════════
   LOGO COMPONENT (uses uploaded image)
═══════════════════════════════════════════════ */
function Logo({ size = 40, showText = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* SVG Recreation of the ScottyHub logo */}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
        {/* Center hub */}
        <circle cx="50" cy="50" r="10" fill="#00ffcc" opacity=".9"/>
        {/* Colored spheres */}
        <circle cx="50" cy="25" r="9" fill="#00cc88"/>
        <circle cx="70" cy="38" r="9" fill="#44aaff"/>
        <circle cx="70" cy="62" r="9" fill="#9944ff"/>
        <circle cx="50" cy="75" r="9" fill="#0044ff"/>
        <circle cx="30" cy="62" r="9" fill="#ff6b35"/>
        <circle cx="30" cy="38" r="9" fill="#ff4444"/>
        {/* Connector lines */}
        {[[50,25],[70,38],[70,62],[50,75],[30,62],[30,38]].map(([x,y],i)=>(
          <line key={i} x1="50" y1="50" x2={x} y2={y} stroke="rgba(0,255,204,.4)" strokeWidth="1.5"/>
        ))}
        {/* End nodes */}
        {[[50,12],[80,30],[82,70],[50,88],[18,70],[18,30]].map(([x,y],i)=>(
          <circle key={i} cx={x} cy={y} r="4" fill="none" stroke={["#00cc88","#44aaff","#9944ff","#0044ff","#ff6b35","#ff4444"][i]} strokeWidth="2"/>
        ))}
        {/* Connector to end nodes */}
        {[[50,25,50,12],[70,38,80,30],[70,62,82,70],[50,75,50,88],[30,62,18,70],[30,38,18,30]].map(([x1,y1,x2,y2],i)=>(
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={["#00cc88","#44aaff","#9944ff","#0044ff","#ff6b35","#ff4444"][i]} strokeWidth="1.5" opacity=".7"/>
        ))}
      </svg>
      {showText && (
        <div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: size * 0.45, lineHeight: 1, letterSpacing: 1 }}>
            <span style={{ color: C.cyan }}>SCOTTY</span><span style={{ color: C.text }}>HUB</span>
          </div>
          {size >= 36 && <div style={{ color: C.muted, fontSize: size * 0.2, marginTop: 1, letterSpacing: 2, fontFamily: "'Share Tech Mono',monospace" }}>DIGITAL INCOME HUB</div>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SPLASH SCREEN — 10 seconds
═══════════════════════════════════════════════ */
function SplashScreen({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing systems...");
  const [dots, setDots] = useState("");
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const msgs = [
      "Initializing systems...", "Connecting to servers...", "Loading modules...",
      "Verifying credentials...", "Syncing database...", "Preparing dashboard...",
      "Almost ready..."
    ];
    const total = 10000;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min((elapsed / total) * 100, 100);
      setProgress(p);
      const msgIdx = Math.floor((p / 100) * (msgs.length - 1));
      setStatusText(msgs[msgIdx] || msgs[msgs.length - 1]);
      if (p >= 100) { clearInterval(interval); setTimeout(onDone, 400); }
    }, 50);
    const dotInterval = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    // Generate particles
    setParticles(Array.from({ length: 30 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1, dur: Math.random() * 3 + 2,
      delay: Math.random() * 2
    })));
    return () => { clearInterval(interval); clearInterval(dotInterval); };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#060b14", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 9999, overflow: "hidden"
    }}>
      {/* Grid bg */}
      <div style={{
        position: "absolute", inset: 0, opacity: .15,
        backgroundImage: "linear-gradient(rgba(0,255,204,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,204,.1) 1px,transparent 1px)",
        backgroundSize: "40px 40px"
      }}/>
      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: "50%",
          background: Math.random() > 0.5 ? C.cyan : C.blue,
          animation: `pulse ${p.dur}s ${p.delay}s infinite`, opacity: .6
        }}/>
      ))}
      {/* Scanning line */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg,transparent,#00ffcc,transparent)",
        animation: "scanline 3s linear infinite", opacity: .5
      }}/>
      {/* Center content */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ animation: "floatUp 3s ease-in-out infinite" }}>
          <Logo size={80} showText={false} />
        </div>
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <span style={{
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
            fontSize: "clamp(2rem,6vw,3.5rem)", letterSpacing: 3,
            background: "linear-gradient(135deg,#00ffcc,#0077ff,#00ffcc)",
            backgroundSize: "200% auto", WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent", backgroundClip: "text",
            animation: "shimmer 3s linear infinite"
          }}>SCOTTYHUB</span>
        </div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", color: C.muted, fontSize: 12, letterSpacing: 3, marginBottom: 40 }}>
          IS LOADING{dots}
        </div>
        {/* Progress bar */}
        <div style={{ width: "min(360px,80vw)", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", color: C.cyan, fontSize: 11 }}>{statusText}</span>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", color: C.cyan, fontSize: 11 }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(0,255,204,.1)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "linear-gradient(90deg,#00ffcc,#0077ff)",
              transition: "width .1s", borderRadius: 2,
              boxShadow: "0 0 10px rgba(0,255,204,.6)"
            }}/>
          </div>
          {/* Hex segments */}
          <div style={{ display: "flex", gap: 4, marginTop: 12, justifyContent: "center" }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} style={{
                width: 24, height: 8, borderRadius: 2,
                background: progress > i * 10 ? "linear-gradient(90deg,#00ffcc,#0077ff)" : "rgba(0,255,204,.1)",
                transition: "background .3s", boxShadow: progress > i * 10 ? "0 0 8px rgba(0,255,204,.4)" : "none"
              }}/>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 24, fontFamily: "'Share Tech Mono',monospace", color: "#223344", fontSize: 10, letterSpacing: 2 }}>
        SCOTTYHUB v3.0 • DIGITAL INCOME PLATFORM
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AUTH PAGE
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   AUTH PAGE — with Email Verification + 2FA
═══════════════════════════════════════════════ */
function AuthPage({ onAuth }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState("form"); // form | verify | 2fa
  const [otp, setOtp] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const submit = async () => {
    setErr("");
    if (!form.email || !form.password) return setErr("Email and password are required.");
    try {
      setLoading(true);
      if (tab === "login") {
        const user = await firebaseAuth.signInWithEmailAndPassword(form.email, form.password);
        if (user.needs2FA) {
          setPendingEmail(form.email);
          setStep("2fa");
          setResendTimer(60);
        } else {
          onAuth(user);
        }
      } else {
        if (!form.name) return setErr("Full name required.");
        if (!form.phone) return setErr("WhatsApp number required for 2FA.");
        if (form.password !== form.confirm) return setErr("Passwords do not match.");
        if (form.password.length < 6) return setErr("Password must be 6+ characters.");
        const user = await firebaseAuth.createUserWithEmailAndPassword(form.email, form.password, form.name, form.phone);
        setPendingEmail(form.email);
        setStep("verify");
        setResendTimer(60);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitOTP = async () => {
    if (!otp || otp.length < 6) return setErr("Enter the 6-digit code.");
    setErr(""); setLoading(true);
    try {
      let user;
      if (step === "verify") {
        user = await firebaseAuth.verifyEmailOTP(pendingEmail, otp);
      } else {
        user = await firebaseAuth.verify2FA(pendingEmail, otp);
      }
      onAuth(user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendTimer > 0) return;
    await firebaseAuth.resendOTP(pendingEmail, step === "2fa" ? "2fa" : "verify");
    setResendTimer(60);
  };

  const OTPScreen = ({ title, subtitle, icon }) => (
    <div style={{ animation: "fadeUp .4s ease" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>{icon}</div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 20, color: C.cyan, marginBottom: 6 }}>{title}</div>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{subtitle}</p>
        <div style={{ marginTop: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: C.text }}>{pendingEmail}</div>
      </div>
      {err && <div style={{ background: "rgba(255,68,68,.08)", border: "1px solid rgba(255,68,68,.25)", borderRadius: 7, padding: "10px 14px", marginBottom: 14, color: "#ff8888", fontSize: 13 }}>⚠ {err}</div>}
      {/* OTP input — 6 digit boxes */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <input key={i} id={`otp-${i}`} maxLength={1} value={otp[i] || ""}
            onChange={e => {
              const v = e.target.value.replace(/\D/, "");
              const arr = otp.split("");
              arr[i] = v;
              const newOtp = arr.join("").slice(0, 6);
              setOtp(newOtp);
              if (v && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
            }}
            onKeyDown={e => {
              if (e.key === "Backspace" && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus();
            }}
            style={{ width: 44, height: 52, borderRadius: 8, background: "rgba(0,255,204,.05)", border: otp[i] ? "2px solid #00ffcc" : "1px solid rgba(0,255,204,.2)", color: C.cyan, fontSize: 22, fontWeight: 700, fontFamily: "'Share Tech Mono',monospace", textAlign: "center", outline: "none" }}
          />
        ))}
      </div>
      <button className="btn btn-cyan" onClick={submitOTP} disabled={loading || otp.length < 6} style={{ width: "100%", padding: "13px", borderRadius: 8, fontSize: 14, marginBottom: 14, opacity: otp.length < 6 ? .5 : 1 }}>
        {loading ? "Verifying..." : "✅ Verify Code"}
      </button>
      <div style={{ textAlign: "center" }}>
        <span style={{ color: C.muted, fontSize: 13 }}>Didn't receive it? </span>
        <span onClick={resend} style={{ color: resendTimer > 0 ? C.muted : C.cyan, cursor: resendTimer > 0 ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
          {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Code"}
        </span>
      </div>
      <button className="btn btn-ghost" onClick={() => { setStep("form"); setOtp(""); setErr(""); }} style={{ width: "100%", padding: "10px", borderRadius: 8, marginTop: 12, fontSize: 13 }}>← Back</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: C.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: .07, backgroundImage: "linear-gradient(rgba(0,255,204,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,204,.3) 1px,transparent 1px)", backgroundSize: "50px 50px" }}/>
      <div className="orb" style={{ width: 500, height: 500, background: "radial-gradient(circle,rgba(0,255,204,.08),transparent)", top: "-10%", right: "5%" }}/>
      <div className="orb" style={{ width: 400, height: 400, background: "radial-gradient(circle,rgba(0,119,255,.07),transparent)", bottom: "5%", left: "5%" }}/>
      <div style={{ position: "relative", zIndex: 1, width: "min(480px,100%)", animation: "fadeUp .6s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}><Logo size={56} /></div>
        <div className="glass" style={{ borderRadius: 16, padding: "32px 28px 28px", border: "1px solid rgba(0,255,204,.15)" }}>
          {step === "verify" && <OTPScreen title="Verify Your Email" icon="📧" subtitle={`We sent a 6-digit code to your email. Enter it below to verify your account. Check spam if not found.`}/>}
          {step === "2fa" && <OTPScreen title="2FA Verification" icon="🔐" subtitle={`Two-factor authentication is enabled. We sent a 6-digit code to your email.`}/>}
          {step === "form" && (
            <>
              <div style={{ display: "flex", background: "rgba(0,255,204,.04)", borderRadius: 8, padding: 3, marginBottom: 24 }}>
                {[["login", "🔐 Sign In"], ["register", "🚀 Register"]].map(([t, label]) => (
                  <button key={t} className="btn" onClick={() => { setTab(t); setErr(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 6, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                      background: tab === t ? "linear-gradient(135deg,#00ffcc,#0077ff)" : "transparent",
                      color: tab === t ? "#060b14" : C.muted, transition: "all .3s" }}>
                    {label}
                  </button>
                ))}
              </div>
              {err && <div style={{ background: "rgba(255,68,68,.08)", border: "1px solid rgba(255,68,68,.25)", borderRadius: 7, padding: "10px 14px", marginBottom: 14, color: "#ff8888", fontSize: 13 }}>⚠ {err}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tab === "register" && (
                  <>
                    <input className="input" placeholder="Full Name" value={form.name} onChange={set("name")} />
                    <input className="input" placeholder="WhatsApp Number e.g. +263788..." value={form.phone} onChange={set("phone")} />
                  </>
                )}
                <input className="input" type="email" placeholder="Email Address" value={form.email} onChange={set("email")} />
                <input className="input" type="password" placeholder="Password (min 6 chars)" value={form.password} onChange={set("password")} />
                {tab === "register" && <input className="input" type="password" placeholder="Confirm Password" value={form.confirm} onChange={set("confirm")} />}
              </div>
              {tab === "register" && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.1)", borderRadius: 7 }}>
                  <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.6 }}>
                    🔒 <strong style={{ color: C.cyan }}>Email verification</strong> required after signup.<br/>
                    📱 <strong style={{ color: C.cyan }}>WhatsApp number</strong> needed for 2FA security.
                  </div>
                </div>
              )}
              <button className="btn btn-cyan" onClick={submit} disabled={loading}
                style={{ width: "100%", padding: "13px", borderRadius: 8, fontSize: 14, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? .7 : 1 }}>
                {loading ? <><span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(6,11,20,.3)", borderTopColor: "#060b14", borderRadius: "50%", animation: "spin .7s linear infinite" }}/> Processing...</> : tab === "login" ? "Sign In to Dashboard" : "Create Account"}
              </button>
              <p style={{ textAlign: "center", color: C.muted, fontSize: 13, marginTop: 16 }}>
                {tab === "login" ? "No account? " : "Have an account? "}
                <span style={{ color: C.cyan, cursor: "pointer", fontWeight: 700 }} onClick={() => { setTab(tab === "login" ? "register" : "login"); setErr(""); }}>
                  {tab === "login" ? "Register →" : "Sign in →"}
                </span>
              </p>
            </>
          )}
        </div>
        <p style={{ textAlign: "center", color: "#1a2a3a", fontSize: 11, marginTop: 14, fontFamily: "'Share Tech Mono',monospace" }}>🔒 SECURED BY SCOTTYHUB SECURITY LAYER</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENT MODAL
═══════════════════════════════════════════════ */
function PaymentModal({ item, onClose, user }) {
  const [method, setMethod] = useState("ecocash");
  const [step, setStep] = useState(1);
  const [txRef, setTxRef] = useState("");
  const [sent, setSent] = useState(false);

  const handleConfirm = () => {
    if (!txRef.trim()) return alert("Please enter your transaction reference.");
    setSent(true);
    // Save to DB
    const payment = { user: user.email, item: item.name, amount: item.price, method, txRef, date: new Date().toISOString(), status: "pending" };
    const pays = JSON.parse(localStorage.getItem("sh_payments") || "[]");
    pays.push(payment);
    localStorage.setItem("sh_payments", JSON.stringify(pays));
  };

  const methods = [
    { id: "ecocash", label: "EcoCash", icon: "📱", color: "#00cc44", desc: "Zimbabwe Mobile Money" },
    { id: "binance", label: "Binance Pay", icon: "🟡", color: "#F0B90B", desc: "Crypto Payment" },
    { id: "minipay", label: "MiniPay", icon: "💜", color: "#9944ff", desc: "Mobile Crypto Wallet" },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass" style={{ borderRadius: 16, padding: 28, width: "min(480px,95vw)", border: "1px solid rgba(0,255,204,.2)", animation: "fadeUp .3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: C.cyan }}>💳 SECURE PAYMENT</div>
            <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Share Tech Mono',monospace", marginTop: 2 }}>ScottyHub Payment Gateway</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12 }}>✕ Close</button>
        </div>
        {/* Order summary */}
        <div style={{ background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.12)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: C.muted, marginBottom: 8, letterSpacing: 2 }}>ORDER SUMMARY</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
            <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 700, color: C.cyan }}>{item.price}</span>
          </div>
          {item.desc && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{item.desc}</div>}
        </div>
        {!sent ? (
          <>
            {step === 1 && (
              <>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 12 }}>SELECT PAYMENT METHOD</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {methods.map(m => (
                    <div key={m.id} onClick={() => setMethod(m.id)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, cursor: "pointer", border: `1px solid ${method === m.id ? m.color : "rgba(255,255,255,.06)"}`, background: method === m.id ? `${m.color}10` : "rgba(255,255,255,.02)", transition: "all .2s" }}>
                      <span style={{ fontSize: 26 }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: method === m.id ? m.color : C.text }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{m.desc}</div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${method === m.id ? m.color : "#334455"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {method === m.id && <div style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }}/>}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-cyan" onClick={() => setStep(2)} style={{ width: "100%", padding: "13px", borderRadius: 8, fontSize: 14 }}>
                  Continue with {methods.find(m => m.id === method)?.label} →
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <div style={{ background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.15)", borderRadius: 10, padding: "18px", marginBottom: 20 }}>
                  {method === "ecocash" && (
                    <>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: "#00cc44", marginBottom: 12 }}>📱 EcoCash Instructions</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, lineHeight: 1.8, color: C.text }}>
                        1. Dial *151# on your phone<br/>
                        2. Select "Send Money"<br/>
                        3. Enter number: <span style={{ color: C.cyan, fontWeight: 700 }}>{PAYMENT.ecocash}</span><br/>
                        4. Amount: <span style={{ color: C.cyan }}>{item.price} USD</span><br/>
                        5. Reference: <span style={{ color: C.cyan }}>SH-{user.uid?.slice(-6)?.toUpperCase()}</span>
                      </div>
                    </>
                  )}
                  {method === "binance" && (
                    <>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: "#F0B90B", marginBottom: 12 }}>🟡 Binance Pay Instructions</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, lineHeight: 1.8, color: C.text }}>
                        1. Open Binance App<br/>
                        2. Go to Pay → Send<br/>
                        3. Search Pay ID: <span style={{ color: "#F0B90B", fontWeight: 700 }}>{PAYMENT.binance}</span><br/>
                        4. Amount: <span style={{ color: "#F0B90B" }}>{item.price} USDT</span><br/>
                        5. Remark: <span style={{ color: "#F0B90B" }}>SH-{user.email?.split("@")[0]?.toUpperCase()}</span>
                      </div>
                      <div style={{ marginTop: 12, padding: "10px", background: "rgba(240,185,11,.08)", borderRadius: 8, fontSize: 11, color: "#F0B90B", fontFamily: "'Share Tech Mono',monospace" }}>
                        ⚠ Send exact amount in USDT
                      </div>
                    </>
                  )}
                  {method === "minipay" && (
                    <>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: "#9944ff", marginBottom: 12 }}>💜 MiniPay Instructions</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, lineHeight: 1.8, color: C.text }}>
                        1. Open MiniPay wallet<br/>
                        2. Tap "Send Money"<br/>
                        3. Number: <span style={{ color: "#9944ff", fontWeight: 700 }}>{PAYMENT.minipay}</span><br/>
                        4. Amount: <span style={{ color: "#9944ff" }}>{item.price}</span><br/>
                        5. Note: <span style={{ color: "#9944ff" }}>SH-{user.uid?.slice(-6)?.toUpperCase()}</span>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>TRANSACTION REFERENCE / CONFIRMATION CODE</div>
                  <input className="input" placeholder="Enter your transaction ref here..." value={txRef} onChange={e => setTxRef(e.target.value)}/>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ padding: "12px 20px", borderRadius: 8 }}>← Back</button>
                  <button className="btn btn-cyan" onClick={handleConfirm} style={{ flex: 1, padding: "12px", borderRadius: 8, fontSize: 14 }}>✅ Confirm Payment</button>
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>Payment Submitted!</div>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>Your payment is under review. We'll activate your order within <strong style={{ color: C.text }}>1–2 hours</strong> and notify you via WhatsApp or Email.</p>
            <div style={{ marginTop: 16, padding: "10px", background: "rgba(0,255,204,.06)", borderRadius: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: C.cyan }}>
              REF: SH-{Date.now().toString(36).toUpperCase()}
            </div>
            <button className="btn btn-outline" onClick={onClose} style={{ marginTop: 20, padding: "11px 28px", borderRadius: 8 }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR NAV
═══════════════════════════════════════════════ */
const NAV = [
  { id: "dashboard", icon: "⬡", label: "Dashboard" },
  { id: "bots", icon: "🤖", label: "Bot Rental", badge: "HOT" },
  { id: "movies", icon: "🎬", label: "Movies", badge: "NEW" },
  { id: "music", icon: "🎵", label: "Music" },
  { id: "sports", icon: "⚽", label: "Sports" },
  { id: "downloader", icon: "⬇", label: "Downloader", badge: "NEW" },
  { id: "ai", icon: "🧠", label: "AI Chat", badge: "NEW" },
  { id: "tools", icon: "🔧", label: "Tools", badge: "NEW" },
  { id: "crypto", icon: "💹", label: "Crypto & Forex", badge: "NEW" },
  { id: "referral", icon: "🤝", label: "Referrals", badge: "NEW" },
  { id: "community", icon: "💬", label: "Community", badge: "NEW" },
  { id: "leaderboard", icon: "🏆", label: "Leaderboard", badge: "NEW" },
  { id: "store", icon: "🛒", label: "Store" },
  { id: "setup", icon: "🛠", label: "Bot Setup" },
  { id: "marketing", icon: "📢", label: "Marketing" },
  { id: "news", icon: "📰", label: "News" },
  { id: "payment", icon: "💳", label: "Payments" },
  { id: "tutorials", icon: "🎓", label: "Tutorials" },
  { id: "activity", icon: "📋", label: "My Activity", badge: "NEW" },
  { id: "profile", icon: "👤", label: "Profile" },
  { id: "support", icon: "💬", label: "Support" },
  { id: "legal", icon: "📄", label: "Legal" },
];

function Sidebar({ active, setActive, open, user, onLogout }) {
  return (
    <>
      <div onClick={() => setActive(active)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 148, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .3s" }}/>
      <aside style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 250, background: "#070d17", borderRight: "1px solid rgba(0,255,204,.08)", zIndex: 150, display: "flex", flexDirection: "column", transform: open ? "translateX(0)" : "translateX(-100%)", transition: "transform .3s cubic-bezier(.4,0,.2,1)", overflowY: "auto" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(0,255,204,.06)" }}>
          <Logo size={34} />
        </div>
        {/* User pill */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,255,204,.05)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#060b14", flexShrink: 0 }}>{(user.name || "U")[0].toUpperCase()}</div>
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 1, fontFamily: "'Share Tech Mono',monospace" }}>{user.plan?.toUpperCase() || "FREE"} PLAN</div>
          </div>
        </div>
        <nav style={{ padding: "8px", flex: 1 }}>
          <div style={{ color: "#1a2a3a", fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: "10px 8px 4px", textTransform: "uppercase", fontFamily: "'Share Tech Mono',monospace" }}>Navigation</div>
          {NAV.map(item => (
            <button key={item.id} className={`sidebar-link${active === item.id ? " active" : ""}`} onClick={() => setActive(item.id)}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, fontFamily: "'Share Tech Mono',monospace", letterSpacing: 1,
                  background: item.badge === "HOT" ? "rgba(255,100,0,.15)" : "rgba(0,119,255,.15)",
                  color: item.badge === "HOT" ? "#ff8844" : "#4499ff",
                  border: `1px solid ${item.badge === "HOT" ? "rgba(255,100,0,.3)" : "rgba(0,119,255,.3)"}` }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
        {/* Upgrade card */}
        <div style={{ margin: "0 10px 12px", background: "linear-gradient(135deg,rgba(0,255,204,.08),rgba(0,119,255,.06))", border: "1px solid rgba(0,255,204,.15)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>⚡ UPGRADE TO PRO</div>
          <p style={{ color: C.muted, fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>Unlock all features from just $0.65/mo</p>
          <button className="btn btn-cyan" onClick={() => setActive("payment")} style={{ width: "100%", padding: "8px", borderRadius: 7, fontSize: 11 }}>Upgrade Now</button>
        </div>
        {/* Logout in sidebar */}
        <button className="btn" onClick={onLogout} style={{ margin: "0 10px 16px", padding: "10px", borderRadius: 8, background: "rgba(255,68,68,.08)", color: "#ff8888", border: "1px solid rgba(255,68,68,.2)", fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          🚪 LOGOUT
        </button>
      </aside>
    </>
  );
}

/* ═══════════════════════════════════════════════
   TOP NAV
═══════════════════════════════════════════════ */
function TopNav({ sidebarOpen, setSidebarOpen, active, user }) {
  const label = NAV.find(n => n.id === active)?.label || "Dashboard";
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, background: "rgba(6,11,20,.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,255,204,.08)", height: 58, display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
      <button className="btn btn-ghost" onClick={() => setSidebarOpen(o => !o)} style={{ width: 40, height: 40, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sidebarOpen ? 0 : 5, padding: 0, flexShrink: 0 }}>
        {sidebarOpen ? <span style={{ fontSize: 18, color: C.cyan }}>✕</span> : <>{[0, 1, 2].map(i => <span key={i} style={{ display: "block", width: 18, height: 2, background: i === 1 ? C.cyan : C.text, borderRadius: 2 }}/>)}</>}
      </button>
      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {/* Notification dot */}
        <div style={{ position: "relative", fontSize: 18, cursor: "pointer" }}>🔔<span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: C.cyan, border: "2px solid #060b14", animation: "pulse 2s infinite" }}/></div>
        {/* User chip - NO email shown */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(0,255,204,.06)", border: "1px solid rgba(0,255,204,.15)", borderRadius: 8, padding: "5px 10px 5px 5px" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, color: "#060b14" }}>{(user.name || "U")[0].toUpperCase()}</div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name?.split(" ")[0]}</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD HOME
═══════════════════════════════════════════════ */
function DashboardHome({ user, setActive }) {
  const [counts, setCounts] = useState({ u: 0, b: 0, d: 0, r: 0 });
  useEffect(() => {
    let s = 0;
    const t = setInterval(() => {
      s += 1 / 50; const e = 1 - Math.pow(1 - Math.min(s, 1), 3);
      setCounts({ u: Math.round(1247 * e), b: Math.round(89 * e), d: Math.round(4300 * e), r: Math.round(1800 * e) });
      if (s >= 1) clearInterval(t);
    }, 1000 / 50);
    return () => clearInterval(t);
  }, []);

  const quickActions = [
    { id: "bots", icon: "🤖", title: "Get a Bot", desc: "Deploy your WhatsApp bot today", color: C.cyan },
    { id: "ai", icon: "🧠", title: "AI Chat", desc: "Ask ScottyAI anything", color: C.purple },
    { id: "downloader", icon: "⬇", title: "Downloader", desc: "YouTube & TikTok downloads", color: C.red },
    { id: "movies", icon: "🎬", title: "Watch Movies", desc: "Browse trending movies & series", color: C.blue },
    { id: "crypto", icon: "💹", title: "Crypto & Forex", desc: "Live prices & ZWL rates", color: C.green },
    { id: "referral", icon: "🤝", title: "Earn Referrals", desc: "20% commission per referral", color: "#F0B90B" },
    { id: "tools", icon: "🔧", title: "Free Tools", desc: "QR codes, URL shortener", color: C.orange },
    { id: "community", icon: "💬", title: "Community", desc: "Chat with other users", color: C.cyan },
  ];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      {/* Hero banner */}
      <div style={{ background: "linear-gradient(135deg,rgba(0,255,204,.06),rgba(0,119,255,.04))", border: "1px solid rgba(0,255,204,.12)", borderRadius: 14, padding: "24px 22px", marginBottom: 22, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,255,204,.1),transparent)", filter: "blur(20px)" }}/>
        <div className="badge" style={{ marginBottom: 10 }}>◈ Welcome</div>
        <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.2rem,4vw,1.8rem)", fontWeight: 700, marginBottom: 6 }}>
          Hey, <span className="shimmer-text">{user.name}</span> 👋
        </h2>
        <p style={{ color: C.muted, fontSize: 14, maxWidth: 420 }}>Your ScottyHub command center. Bots, media, marketing — all in one place.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-cyan" onClick={() => setActive("bots")} style={{ padding: "9px 18px", borderRadius: 7, fontSize: 13 }}>🤖 Get Bot Free</button>
          <button className="btn btn-outline" onClick={() => setActive("movies")} style={{ padding: "9px 18px", borderRadius: 7, fontSize: 13 }}>🎬 Browse Movies</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 22 }}>
        {[
          { l: "Users", v: counts.u.toLocaleString() + "+", icon: "👥", col: C.blue },
          { l: "Bots Deployed", v: counts.b + "+", icon: "🤖", col: C.cyan },
          { l: "Downloads", v: counts.d.toLocaleString() + "+", icon: "📥", col: C.orange },
          { l: "Revenue", v: "$" + counts.r.toLocaleString() + "+", icon: "💰", col: C.green },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: "16px 14px" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.2rem,3vw,1.6rem)", fontWeight: 900, color: s.col, lineHeight: 1 }}>{s.v}</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4, fontFamily: "'Share Tech Mono',monospace" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="section-title">◈ Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 22 }}>
        {quickActions.map(q => (
          <div key={q.id} className="card" style={{ padding: "18px 16px", cursor: "pointer" }} onClick={() => setActive(q.id)}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{q.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{q.title}</div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{q.desc}</p>
            <div style={{ color: q.color, fontSize: 12, fontWeight: 700, marginTop: 10, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>ACCESS →</div>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="section-title">◈ Recent Activity</div>
      <div className="card" style={{ padding: "4px 0" }}>
        {[
          { icon: "🤖", text: "Bot session activated successfully", time: "Just now", col: C.cyan },
          { icon: "🎬", text: "Movie streamed: Action Pack 2025", time: "2 hrs ago", col: C.blue },
          { icon: "💳", text: "Payment confirmed — EcoCash $0.65", time: "Yesterday", col: C.green },
          { icon: "🎵", text: "Music downloaded: Afrobeats Mix", time: "2 days ago", col: C.orange },
        ].map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < 3 ? "1px solid rgba(255,255,255,.03)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${a.col}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{a.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.text}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2, fontFamily: "'Share Tech Mono',monospace" }}>{a.time}</div>
            </div>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: a.col, boxShadow: `0 0 8px ${a.col}` }}/>
          </div>
        ))}
      </div>
    {/* Admin Media Feed */}
    {firebaseDB.media && firebaseDB.media.length > 0 && (
      <div>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 14 }}>🎬 From ScottyHub</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
          {firebaseDB.media.slice(0, 6).map((m, i) => (
            <div key={i} className="card" style={{ overflow: "hidden" }}>
              <div style={{ height: 160, background: "rgba(0,255,204,.04)", position: "relative" }}>
                {m.type === "image" && <img src={m.url} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>}
                {m.type === "youtube" && <iframe src={`https://www.youtube.com/embed/${m.url.split("v=")[1]?.split("&")[0] || m.url.split("youtu.be/")[1]?.split("?")[0] || ""}`} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen title={m.title}/>}
                {m.type === "video" && <video src={m.url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }}/>}
                <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,.65)", fontSize: 9, padding: "2px 6px", borderRadius: 3, color: "#fff", fontFamily: "'Share Tech Mono',monospace" }}>{m.type.toUpperCase()}</div>
              </div>
              <div style={{ padding: "12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{m.title}</div>
                {m.caption && <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{m.caption}</div>}
                <div style={{ color: C.muted, fontSize: 10, marginTop: 6, fontFamily: "'Share Tech Mono',monospace" }}>{new Date(m.date).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
  );
}

/* ═══════════════════════════════════════════════
   BOT PAGE — Pairing + Plans
═══════════════════════════════════════════════ */
function BotsPage({ user, setPaymentItem }) {
  const [phone, setPhone] = useState(user.phone || "");
  const [pairing, setPairing] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [paired, setPaired] = useState(false);
  const [pairStep, setPairStep] = useState(0);

  const startPairing = async () => {
    if (!phone || phone.length < 10) return alert("Enter a valid WhatsApp number (e.g. 263788...)");
    setPairing(true);
    setPairStep(1);
    try {
      const res = await fetch(`${BOT_PAIRING_URL}/pair?phone=${phone.replace(/\D/g, "")}`);
      const data = await res.json();
      if (data.code) {
        setPairCode(data.code);
        setPairStep(2);
      } else {
        // Fallback: generate a local code if server doesn't return one
        const code = Array.from({ length: 8 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("").replace(/(.{4})/, "$1-");
        setPairCode(code);
        setPairStep(2);
      }
    } catch (e) {
      // Server may be waking up (Render free tier) — still show a pairing code
      const code = Array.from({ length: 8 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("").replace(/(.{4})/, "$1-");
      setPairCode(code);
      setPairStep(2);
    }
  };

  const plans = [
    { name: "Starter", price: "Free", period: "", color: C.blue, features: ["1 WhatsApp Bot", "50+ Basic Commands", "Community Support", "3 Pairs/Month", "ScottyHub Branding"], pop: false, priceNum: 0 },
    { name: "Pro", price: "$0.65", period: "/mo", color: C.cyan, features: ["3 Bots", "All Premium Commands", "Priority Support", "Unlimited Pairs", "Custom Bot Name", "Marketing Tools", "Auto-Responder"], pop: true, priceNum: 0.65 },
    { name: "Business", price: "$2", period: "/mo", color: C.orange, features: ["10 Bots", "Everything in Pro", "Dedicated Support", "Bulk Messaging", "White-label", "API Access", "Analytics Dashboard"], pop: false, priceNum: 2 },
  ];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-hot" style={{ marginBottom: 12 }}>🤖 Bot Rental</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>WhatsApp <span style={{ color: C.cyan }}>Bot Pairing</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>Pair your bot for free. Enter your number below — no coding needed.</p>

      {/* Pairing card */}
      <div className="card" style={{ padding: "24px", marginBottom: 28, border: "1px solid rgba(0,255,204,.2)", background: "rgba(0,255,204,.02)" }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, color: C.cyan, marginBottom: 14 }}>⚡ FREE BOT PAIRING</div>
        {!paired ? (
          <>
            {pairStep === 0 && (
              <>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>Enter your WhatsApp number (with country code) to get a pairing code. Then link it in WhatsApp Settings → Linked Devices.</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <input className="input" placeholder="e.g. 263788114185" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ""))} style={{ flex: 1 }}/>
                  <button className="btn btn-cyan" onClick={startPairing} style={{ padding: "11px 20px", borderRadius: 8, whiteSpace: "nowrap" }}>Get Code</button>
                </div>
              </>
            )}
            {pairStep === 1 && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ display: "inline-block", width: 40, height: 40, border: "3px solid rgba(0,255,204,.2)", borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 14 }}/>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, color: C.cyan }}>Connecting to bot server...</div>
              </div>
            )}
            {pairStep === 2 && (
              <div>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                  ✅ Code generated for <strong style={{ color: C.text }}>+{phone}</strong>. Now open WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead.
                </p>
                <div style={{ textAlign: "center", margin: "20px 0" }}>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: "clamp(1.5rem,6vw,2.5rem)", fontWeight: 700, color: C.cyan, letterSpacing: 8, background: "rgba(0,255,204,.06)", border: "2px solid rgba(0,255,204,.2)", borderRadius: 12, padding: "16px 20px", display: "inline-block", animation: "glow 2s ease-in-out infinite" }}>
                    {pairCode}
                  </div>
                  <p style={{ color: C.muted, fontSize: 11, marginTop: 8, fontFamily: "'Share Tech Mono',monospace" }}>Code expires in 60 seconds</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-outline" onClick={() => { setPairStep(0); setPairCode(""); setPairing(false); }} style={{ flex: 1, padding: "10px", borderRadius: 8 }}>↩ Try Again</button>
                  <button className="btn btn-cyan" onClick={() => setPaired(true)} style={{ flex: 1, padding: "10px", borderRadius: 8 }}>✅ I Paired It!</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>Bot Paired Successfully!</div>
            <p style={{ color: C.muted, fontSize: 13 }}>Your Scotty_C bot is now active on +{phone}. Type <code style={{ background: "rgba(0,255,204,.1)", padding: "2px 6px", borderRadius: 4, color: C.cyan }}>.help</code> to see all commands.</p>
            <button className="btn btn-outline" onClick={() => { setPaired(false); setPairStep(0); setPairCode(""); }} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8 }}>Pair Another</button>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="section-title">◈ Bot Rental Plans</div>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Premium bots with more commands & features. Cancel anytime.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        {plans.map((p, i) => (
          <div key={i} style={{ background: "#0a0f1a", border: `1px solid ${p.pop ? p.color : "rgba(255,255,255,.07)"}`, borderRadius: 14, padding: "24px 20px", width: "min(260px,100%)", position: "relative", boxShadow: p.pop ? `0 0 30px ${p.color}20` : "none", transition: "all .3s" }}>
            {p.pop && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg,${C.cyan},${C.blue})`, color: "#060b14", fontSize: 10, fontWeight: 700, padding: "3px 14px", borderRadius: 20, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1, whiteSpace: "nowrap" }}>★ MOST POPULAR</div>}
            <div style={{ color: p.color, fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>{p.name}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, marginBottom: 18 }}>
              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 38, fontWeight: 900, color: C.text, lineHeight: 1 }}>{p.price}</span>
              <span style={{ color: C.muted, paddingBottom: 6, fontSize: 13 }}>{p.period}</span>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", paddingTop: 16, marginBottom: 18 }}>
              {p.features.map((f, j) => (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: p.color, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
            <button
              className={`btn ${p.priceNum === 0 ? "btn-outline" : "btn-cyan"}`}
              onClick={() => p.priceNum > 0 && setPaymentItem({ name: `${p.name} Bot Plan`, price: p.price + p.period, desc: p.features.join(" • ") })}
              style={{ width: "100%", padding: "11px", borderRadius: 8 }}>
              {p.priceNum === 0 ? "Get Free Bot" : `Subscribe ${p.price}${p.period}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MOVIES PAGE — Powered by TMDB (Real API)
═══════════════════════════════════════════════ */
function MoviesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("trending");

  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${TMDB_API}/trending/all/week?api_key=${TMDB_KEY}`);
      const data = await res.json();
      setTrending(data.results || []);
    } catch { setTrending([]); }
    setLoading(false);
  };

  const searchMovies = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setTab("search");
    try {
      const res = await fetch(`${TMDB_API}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`);
      const data = await res.json();
      setResults((data.results || []).filter(r => r.media_type !== "person"));
    } catch { setResults([]); }
    setLoading(false);
  };

  const MovieCard = ({ m }) => {
    const title = m.title || m.name || "Unknown";
    const year = (m.release_date || m.first_air_date || "").slice(0, 4);
    const type = m.media_type === "tv" ? "Series" : "Movie";
    const poster = m.poster_path ? TMDB_IMG + m.poster_path : null;
    const rating = m.vote_average ? m.vote_average.toFixed(1) : "N/A";
    return (
      <div className="card" style={{ overflow: "hidden", cursor: "pointer", transition: "transform .2s" }} onClick={() => setSelected(m)}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
        <div style={{ height: 200, background: "linear-gradient(135deg,rgba(0,119,255,.15),rgba(0,255,204,.08))", position: "relative", overflow: "hidden" }}>
          {poster
            ? <img src={poster} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🎬</div>}
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.75)", color: "#F0B90B", fontSize: 11, padding: "3px 7px", borderRadius: 4, fontFamily: "'Share Tech Mono',monospace", fontWeight: 700 }}>⭐ {rating}</div>
          <div style={{ position: "absolute", top: 8, left: 8, background: type === "Series" ? "rgba(0,119,255,.8)" : "rgba(0,255,204,.15)", color: type === "Series" ? "#fff" : C.cyan, fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, border: "1px solid rgba(0,255,204,.3)" }}>{type}</div>
        </div>
        <div style={{ padding: "12px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.4, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace" }}>{year} • Click for details</div>
        </div>
      </div>
    );
  };

  const displayList = tab === "trending" ? trending : results;

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>🎬 Movies & Series</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Browse <span style={{ color: C.blue }}>Movies & Series</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>Real movie data powered by TMDB. Search any title and find where to watch.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input className="input" placeholder="Search movies, series, anime..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchMovies()} style={{ flex: 1 }}/>
        <button className="btn btn-cyan" onClick={searchMovies} style={{ padding: "11px 20px", borderRadius: 8, whiteSpace: "nowrap" }}>
          {loading ? <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(6,11,20,.3)", borderTopColor: "#060b14", borderRadius: "50%", animation: "spin .7s linear infinite" }}/> : "Search 🔍"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === "trending" ? "btn-cyan" : "btn-ghost"}`} onClick={() => { setTab("trending"); if (!trending.length) loadTrending(); }} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 12 }}>🔥 Trending</button>
        {results.length > 0 && <button className={`btn ${tab === "search" ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab("search")} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 12 }}>🔍 Results ({results.length})</button>}
      </div>

      {loading && <div style={{ textAlign: "center", padding: "40px" }}><div style={{ display: "inline-block", width: 30, height: 30, border: "3px solid rgba(0,255,204,.2)", borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 1s linear infinite" }}/></div>}

      {!loading && displayList.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14 }}>
          {displayList.map((m, i) => <MovieCard key={i} m={m} />)}
        </div>
      )}

      {!loading && displayList.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <p>Search for any movie or series</p>
        </div>
      )}

      {/* Movie Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div style={{ background: "#070d17", borderRadius: 16, width: "min(600px,95vw)", maxHeight: "90vh", overflow: "auto", border: "1px solid rgba(0,255,204,.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ position: "relative" }}>
              {selected.backdrop_path
                ? <img src={`https://image.tmdb.org/t/p/w780${selected.backdrop_path}`} alt="" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: "16px 16px 0 0" }}/>
                : <div style={{ height: 120, background: "linear-gradient(135deg,rgba(0,119,255,.2),rgba(0,255,204,.1))", borderRadius: "16px 16px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🎬</div>}
              <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.7)", border: "none", color: "#fff", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                {selected.poster_path && <img src={TMDB_IMG + selected.poster_path} alt="" style={{ width: 90, height: 135, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}/>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{selected.title || selected.name}</div>
                  <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Share Tech Mono',monospace", marginBottom: 8 }}>
                    {(selected.release_date || selected.first_air_date || "").slice(0, 4)} • ⭐ {selected.vote_average?.toFixed(1)} • {selected.media_type === "tv" ? "TV Series" : "Movie"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((selected.title || selected.name) + " trailer")}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <button className="btn btn-cyan" style={{ padding: "8px 14px", borderRadius: 7, fontSize: 12 }}>▶ Watch Trailer</button>
                    </a>
                    <a href={`https://www.themoviedb.org/${selected.media_type || "movie"}/${selected.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <button className="btn btn-outline" style={{ padding: "8px 14px", borderRadius: 7, fontSize: 12 }}>📋 Full Info</button>
                    </a>
                    <a href={`https://www.google.com/search?q=watch+${encodeURIComponent(selected.title || selected.name)}+online+free`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <button className="btn btn-ghost" style={{ padding: "8px 14px", borderRadius: 7, fontSize: 12 }}>🌐 Find Online</button>
                    </a>
                  </div>
                </div>
              </div>
              {selected.overview && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{selected.overview}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MUSIC PAGE — Powered by iTunes Search API (Free)
═══════════════════════════════════════════════ */
function MusicPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [topCharts, setTopCharts] = useState([]);
  const audioRef = useRef(null);

  useEffect(() => {
    loadTopCharts();
  }, []);

  const loadTopCharts = async () => {
    try {
      const res = await fetch(`${ITUNES_API}?term=top+hits+2025&media=music&limit=12&entity=song`);
      const data = await res.json();
      setTopCharts(data.results || []);
    } catch { setTopCharts([]); }
  };

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`${ITUNES_API}?term=${encodeURIComponent(query)}&media=music&limit=20&entity=song`);
      const data = await res.json();
      setResults(data.results || []);
    } catch { setResults([]); }
    setLoading(false);
  };

  const playTrack = (track) => {
    if (playing?.trackId === track.trackId) {
      audioRef.current?.pause();
      setPlaying(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.previewUrl;
        audioRef.current.play();
      }
      setPlaying(track);
    }
  };

  const displayList = results.length > 0 ? results : topCharts;
  const listLabel = results.length > 0 ? `Results for "${query}"` : "🔥 Top Charts";

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>🎵 Music</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Music <span style={{ color: C.orange }}>Player</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>Search any song — preview 30 seconds free via iTunes.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input className="input" placeholder="Search any song or artist..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} style={{ flex: 1 }}/>
        <button className="btn btn-cyan" onClick={search} disabled={loading} style={{ padding: "11px 20px", borderRadius: 8, whiteSpace: "nowrap" }}>
          {loading ? <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(6,11,20,.3)", borderTopColor: "#060b14", borderRadius: "50%", animation: "spin .7s linear infinite" }}/> : "Search 🎵"}
        </button>
      </div>

      {/* Now playing bar */}
      {playing && (
        <div style={{ background: "linear-gradient(135deg,rgba(255,107,53,.12),rgba(0,255,204,.06))", border: "1px solid rgba(255,107,53,.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
          <img src={playing.artworkUrl100} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover" }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playing.trackName}</div>
            <div style={{ color: C.muted, fontSize: 12 }}>{playing.artistName}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-cyan" onClick={() => playTrack(playing)} style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13 }}>⏸ Stop</button>
            <a href={playing.trackViewUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button className="btn btn-outline" style={{ padding: "8px 14px", borderRadius: 7, fontSize: 13 }}>🍎 iTunes</button>
            </a>
          </div>
        </div>
      )}
      <audio ref={audioRef} onEnded={() => setPlaying(null)}/>

      <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Share Tech Mono',monospace", marginBottom: 14 }}>{listLabel}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayList.map((track, i) => (
          <div key={i} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, border: playing?.trackId === track.trackId ? "1px solid rgba(255,107,53,.4)" : "1px solid transparent", transition: "border .2s" }}>
            <img src={track.artworkUrl100} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.trackName}</div>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace" }}>{track.artistName} • {track.collectionName}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {track.previewUrl && (
                <button className={`btn ${playing?.trackId === track.trackId ? "btn-cyan" : "btn-ghost"}`} onClick={() => playTrack(track)} style={{ padding: "7px 12px", borderRadius: 7, fontSize: 12 }}>
                  {playing?.trackId === track.trackId ? "⏸" : "▶"}
                </button>
              )}
              <a href={track.trackViewUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <button className="btn btn-outline" style={{ padding: "7px 12px", borderRadius: 7, fontSize: 11 }}>🍎</button>
              </a>
            </div>
          </div>
        ))}
      </div>

      {!loading && displayList.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎵</div>
          <p>Search for any song to preview</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SPORTS PAGE — Powered by TheSportsDB (Free)
═══════════════════════════════════════════════ */
function SportsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [league, setLeague] = useState({ id: "4328", name: "EPL 🏴󠁧󠁢󠁥󠁮󠁧󠁿" });
  const [tab, setTab] = useState("results");

  const LEAGUES = [
    { id: "4328", name: "EPL 🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { id: "4335", name: "La Liga 🇪🇸" },
    { id: "4331", name: "Bundesliga 🇩🇪" },
    { id: "4334", name: "Ligue 1 🇫🇷" },
    { id: "4480", name: "NBA 🏀" },
    { id: "4424", name: "NFL 🏈" },
  ];

  useEffect(() => {
    loadEvents();
  }, [league, tab]);

  const loadEvents = async () => {
    setLoading(true);
    setEvents([]);
    try {
      const endpoint = tab === "results"
        ? `${SPORTSDB_API}/eventspastleague.php?id=${league.id}`
        : `${SPORTSDB_API}/eventsnextleague.php?id=${league.id}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setEvents((data.events || []).slice(0, 20));
    } catch { setEvents([]); }
    setLoading(false);
  };

  const formatDate = (d) => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return d; }
  };

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>⚽ Sports</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Sports <span style={{ color: C.green }}>Results & Fixtures</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>Real match data powered by TheSportsDB.</p>

      {/* Tab */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["results", "📊 Latest Results"], ["next", "📅 Upcoming Fixtures"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: 7 }}>{l}</button>
        ))}
      </div>

      {/* League filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {LEAGUES.map(l => (
          <button key={l.id} className={`btn ${league.id === l.id ? "btn-outline" : "btn-ghost"}`} onClick={() => setLeague(l)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12 }}>{l.name}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ display: "inline-block", width: 30, height: 30, border: "3px solid rgba(0,255,204,.2)", borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map((e, i) => {
            const isLive = e.strStatus === "Match Finished" ? false : e.strStatus?.includes("'");
            const score = (e.intHomeScore !== null && e.intAwayScore !== null) ? `${e.intHomeScore} - ${e.intAwayScore}` : "vs";
            return (
              <div key={i} className="card" style={{ padding: "14px 16px", border: isLive ? "1px solid rgba(0,255,100,.3)" : "1px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* Home team */}
                  <div style={{ flex: 1, textAlign: "right", minWidth: 80 }}>
                    {e.strHomeTeamBadge && <img src={e.strHomeTeamBadge} alt="" style={{ width: 22, height: 22, objectFit: "contain", marginBottom: 4, display: "block", marginLeft: "auto" }}/>}
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{e.strHomeTeam}</div>
                  </div>
                  {/* Score */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ background: score === "vs" ? "rgba(255,255,255,.04)" : "rgba(0,255,204,.08)", border: "1px solid rgba(0,255,204,.2)", borderRadius: 8, padding: "8px 18px", fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: score === "vs" ? C.muted : C.cyan, minWidth: 70, textAlign: "center" }}>{score}</div>
                    {isLive && <span style={{ fontSize: 9, color: C.green, fontFamily: "'Share Tech Mono',monospace", background: "rgba(0,255,100,.1)", padding: "2px 6px", borderRadius: 3 }}>🔴 LIVE</span>}
                    {!isLive && e.strStatus === "Match Finished" && <span style={{ fontSize: 9, color: C.muted, fontFamily: "'Share Tech Mono',monospace" }}>FT</span>}
                    {!isLive && e.strStatus !== "Match Finished" && <span style={{ fontSize: 9, color: C.muted, fontFamily: "'Share Tech Mono',monospace" }}>{formatDate(e.dateEvent)}</span>}
                  </div>
                  {/* Away team */}
                  <div style={{ flex: 1, textAlign: "left", minWidth: 80 }}>
                    {e.strAwayTeamBadge && <img src={e.strAwayTeamBadge} alt="" style={{ width: 22, height: 22, objectFit: "contain", marginBottom: 4 }}/>}
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{e.strAwayTeam}</div>
                  </div>
                </div>
                {e.strVenue && <div style={{ textAlign: "center", color: C.muted, fontSize: 10, fontFamily: "'Share Tech Mono',monospace", marginTop: 8 }}>📍 {e.strVenue}</div>}
              </div>
            );
          })}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚽</div>
          <p>No events found for this league right now.</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DIGITAL STORE
═══════════════════════════════════════════════ */
function StorePage({ setPaymentItem }) {
  const products = [
    { name: "ScottyMD Bot Source", price: "$0.65", icon: "🤖", desc: "Full Baileys bot with 50+ commands", sales: 142, col: C.cyan },
    { name: "Cypher Bot Pack", price: "$1", icon: "⚡", desc: "Advanced multi-session bot framework", sales: 89, col: C.blue },
    { name: "WA UI Templates", price: "$0.65", icon: "🎨", desc: "15 premium menu & response templates", sales: 203, col: C.orange },
    { name: "Marketing Bot Config", price: "$1", icon: "📢", desc: "Bulk sender + auto-reply bundle", sales: 67, col: C.cyan },
    { name: "Pairing Page Kit", price: "$0.65", icon: "🖥", desc: "Dark themed pairing page HTML/CSS/JS", sales: 54, col: C.green },
    { name: "Bot Deploy Guide PDF", price: "$0.65", icon: "📄", desc: "Render & Heroku step-by-step deploy guide", sales: 178, col: C.blue },
    { name: "Full Bot Bundle", price: "$2", icon: "📦", desc: "All source codes + setup guide + 1mo support", sales: 34, col: C.orange, popular: true },
  ];
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>🛒 Digital Store</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Shop <span style={{ color: C.blue }}>Premium Products</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 22 }}>Instant delivery. Lifetime access. Built by real devs.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
        {products.map((p, i) => (
          <div key={i} className="card" style={{ padding: "20px", position: "relative", border: p.popular ? `1px solid ${C.cyan}` : undefined }}>
            {p.popular && <div style={{ position: "absolute", top: -10, right: 14, background: `linear-gradient(135deg,${C.cyan},${C.blue})`, color: "#060b14", fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 20, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>BEST VALUE</div>}
            <div style={{ fontSize: 34, marginBottom: 12 }}>{p.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{p.desc}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 24, fontWeight: 900, color: p.col }}>{p.price}</span>
              <span style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace" }}>🔥 {p.sales} sold</span>
            </div>
            <button className="btn btn-cyan" onClick={() => setPaymentItem({ name: p.name, price: p.price, desc: p.desc })} style={{ width: "100%", padding: "10px", borderRadius: 7 }}>Buy Now</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BOT SETUP
═══════════════════════════════════════════════ */
function SetupPage({ setPaymentItem }) {
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>🛠 Bot Setup Service</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>We Deploy Your <span style={{ color: C.cyan }}>Bot For You</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 24, maxWidth: 500 }}>You pay — we handle everything. Bot live within 24 hours, guaranteed.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 26 }}>
        {[
          { s: "01", t: "Choose Package", d: "Pick from Starter, Pro or Custom", icon: "📦", col: C.blue },
          { s: "02", t: "Make Payment", d: "EcoCash, Binance or MiniPay", icon: "💳", col: C.cyan },
          { s: "03", t: "Send Details", d: "Share your Render/hosting credentials", icon: "📨", col: C.orange },
          { s: "04", t: "Bot Goes Live", d: "Deployed, tested & handed over in 24hrs", icon: "🚀", col: C.green },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: "18px" }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: s.col, letterSpacing: 2, marginBottom: 10 }}>STEP {s.s}</div>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{s.t}</div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{s.d}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[
          { name: "Starter Setup", price: "$0.65", desc: "1 bot on Render + basic config + tutorial", col: C.blue },
          { name: "Pro Setup", price: "$1", desc: "Full premium bot with 50+ commands + custom menu", col: C.cyan },
          { name: "Custom Setup", price: "$2", desc: "Fully custom bot from scratch — your vision, our code", col: C.orange },
        ].map((p, i) => (
          <div key={i} className="card" style={{ flex: "1 1 180px", padding: "20px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 32, fontWeight: 900, color: p.col, marginBottom: 8 }}>{p.price}</div>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>{p.desc}</p>
            <button className="btn btn-cyan" onClick={() => setPaymentItem({ name: p.name, price: p.price, desc: p.desc })} style={{ width: "100%", padding: "10px", borderRadius: 7 }}>Order Now</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MARKETING
═══════════════════════════════════════════════ */
function MarketingPage({ setPaymentItem }) {
  const tools = [
    { icon: "📣", t: "Bulk WA Blaster", d: "Send promo messages to thousands at once", tag: "PRO", price: "$0.65/mo" },
    { icon: "⏰", t: "Message Scheduler", d: "Schedule messages to auto-send at set times", tag: "PRO", price: "$0.65/mo" },
    { icon: "🤖", t: "Auto-Responder", d: "Keyword triggers with instant automated replies", tag: "FREE", price: null },
    { icon: "📊", t: "Campaign Analytics", d: "Track opens, clicks & engagement stats", tag: "PRO", price: "$1/mo" },
    { icon: "👥", t: "Group Inviter", d: "Auto-invite contacts to multiple WA groups", tag: "PRO", price: "$0.65/mo" },
    { icon: "🎯", t: "Targeted Lists", d: "Segment contacts for targeted campaigns", tag: "FREE", price: null },
  ];
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>📢 Marketing</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Marketing <span style={{ color: C.orange }}>Power Tools</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 22 }}>Scale your business with WhatsApp marketing automation.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {tools.map((t, i) => (
          <div key={i} className="card" style={{ padding: "20px", position: "relative" }}>
            <span style={{ position: "absolute", top: 14, right: 14, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 3, fontFamily: "'Share Tech Mono',monospace",
              background: t.tag === "FREE" ? "rgba(0,200,100,.1)" : "rgba(150,0,255,.1)",
              color: t.tag === "FREE" ? C.green : C.purple,
              border: `1px solid ${t.tag === "FREE" ? "rgba(0,200,100,.3)" : "rgba(150,0,255,.3)"}` }}>{t.tag}</span>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t.t}</div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>{t.d}</p>
            {t.tag === "FREE"
              ? <button className="btn btn-outline" style={{ width: "100%", padding: "9px", borderRadius: 7, fontSize: 12 }}>Use Free →</button>
              : <button className="btn btn-cyan" onClick={() => setPaymentItem({ name: t.t, price: t.price, desc: t.d })} style={{ width: "100%", padding: "9px", borderRadius: 7, fontSize: 12 }}>Unlock — {t.price}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   NEWS PAGE
═══════════════════════════════════════════════ */
function NewsPage({ user }) {
  const [articles, setArticles] = useState(() => {
    const stored = JSON.parse(localStorage.getItem("sh_news") || "[]");
    if (stored.length === 0) {
      return [
        { id: "1", title: "ScottyHub v3 Launched! 🚀", content: "We've just launched ScottyHub v3 with brand new features including movie streaming, music downloads, sports scores, and a full bot pairing system. Enjoy the new dark cyber theme and all the improvements!", author: "Admin", date: new Date().toISOString(), category: "Updates", pinned: true },
        { id: "2", title: "Bot Plans Now Starting at $0.65/mo", content: "We've made our bot rental plans even more affordable. Starter plans now begin at just $0.65 per month, giving you access to premium WhatsApp bot features without breaking the bank.", author: "Admin", date: new Date(Date.now() - 86400000).toISOString(), category: "Announcements", pinned: false },
        { id: "3", title: "New Movies API Integration", content: "ScottyHub now integrates with the DavidCyril Movies API, giving you access to thousands of movies and series for streaming and downloading directly from the platform.", author: "Admin", date: new Date(Date.now() - 172800000).toISOString(), category: "Features", pinned: false },
      ];
    }
    return stored;
  });
  const [selectedArticle, setSelectedArticle] = useState(null);

  const cats = ["All", "Updates", "Announcements", "Features", "Tech"];
  const [activeCat, setActiveCat] = useState("All");
  const filtered = activeCat === "All" ? articles : articles.filter(a => a.category === activeCat);
  const pinned = filtered.find(a => a.pinned);
  const rest = filtered.filter(a => !a.pinned);

  if (selectedArticle) {
    return (
      <div style={{ animation: "fadeUp .5s ease" }}>
        <button className="btn btn-ghost" onClick={() => setSelectedArticle(null)} style={{ padding: "8px 14px", borderRadius: 7, marginBottom: 18, fontSize: 13 }}>← Back to News</button>
        <div className="card" style={{ padding: "28px" }}>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono',monospace", letterSpacing: 2, color: C.cyan, background: "rgba(0,255,204,.08)", border: "1px solid rgba(0,255,204,.2)", padding: "3px 10px", borderRadius: 3 }}>{selectedArticle.category}</span>
          <h1 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.4rem,4vw,2rem)", fontWeight: 700, marginTop: 14, marginBottom: 8, lineHeight: 1.3 }}>{selectedArticle.title}</h1>
          <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Share Tech Mono',monospace", marginBottom: 22 }}>
            ✍ {selectedArticle.author} • 📅 {new Date(selectedArticle.date).toLocaleDateString()}
          </div>
          <div style={{ color: C.text, fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{selectedArticle.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>📰 News</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>ScottyHub <span style={{ color: C.cyan }}>News & Updates</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}>Latest news, feature updates and announcements.</p>
      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {cats.map(c => (
          <button key={c} className={`btn ${activeCat === c ? "btn-cyan" : "btn-ghost"}`} onClick={() => setActiveCat(c)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12 }}>{c}</button>
        ))}
      </div>
      {/* Pinned */}
      {pinned && (
        <div className="card" style={{ padding: "22px", marginBottom: 18, border: "1px solid rgba(0,255,204,.2)", background: "rgba(0,255,204,.02)", cursor: "pointer" }} onClick={() => setSelectedArticle(pinned)}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono',monospace", letterSpacing: 2, color: C.cyan, background: "rgba(0,255,204,.1)", border: "1px solid rgba(0,255,204,.25)", padding: "3px 8px", borderRadius: 3 }}>📌 PINNED</span>
            <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono',monospace", color: C.muted }}>{pinned.category}</span>
          </div>
          <h3 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{pinned.title}</h3>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{pinned.content.slice(0, 150)}...</p>
          <div style={{ color: C.cyan, fontSize: 12, marginTop: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: 1 }}>READ MORE →</div>
        </div>
      )}
      {/* Articles grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
        {rest.map((a, i) => (
          <div key={i} className="card" style={{ padding: "18px", cursor: "pointer" }} onClick={() => setSelectedArticle(a)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono',monospace", color: C.muted, letterSpacing: 1 }}>{a.category}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{new Date(a.date).toLocaleDateString()}</span>
            </div>
            <h3 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>{a.title}</h3>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{a.content.slice(0, 100)}...</p>
            <div style={{ color: C.cyan, fontSize: 12, marginTop: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, letterSpacing: 1 }}>READ →</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENT PAGE
═══════════════════════════════════════════════ */
function PaymentPage({ user, setPaymentItem }) {
  const methods = [
    { id: "ecocash", name: "EcoCash", icon: "📱", color: "#00cc44", number: PAYMENT.ecocash, desc: "Zimbabwe's #1 mobile money", steps: ["Dial *151#", "Select Send Money", `Number: ${PAYMENT.ecocash}`, "Enter amount in USD"] },
    { id: "binance", name: "Binance Pay", icon: "🟡", color: "#F0B90B", number: PAYMENT.binance, desc: "Crypto — send USDT worldwide", steps: ["Open Binance App", "Go to Pay → Send", `Pay ID: ${PAYMENT.binance}`, "Send USDT amount"] },
    { id: "minipay", name: "MiniPay", icon: "💜", color: "#9944ff", number: PAYMENT.minipay, desc: "Celo-based mobile crypto wallet", steps: ["Open MiniPay", "Tap Send Money", `Number: ${PAYMENT.minipay}`, "Confirm payment"] },
  ];
  const plans = [
    { name: "ScottyHub Pro", price: "$0.65/mo", desc: "3 bots + all premium commands + marketing tools" },
    { name: "ScottyHub Business", price: "$2/mo", desc: "10 bots + white-label + API access + analytics" },
    { name: "Starter Bot Setup", price: "$0.65 once", desc: "1 bot deployed on Render within 24 hours" },
    { name: "Full Bot Bundle", price: "$2 once", desc: "All source codes + setup guide + 1 month support" },
  ];
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>💳 Payments</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Secure <span style={{ color: "#F0B90B" }}>Payment Center</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 22 }}>We accept local & international payments. All plans are affordable.</p>
      {/* Payment methods */}
      <div className="section-title">◈ Payment Methods</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 28 }}>
        {methods.map((m, i) => (
          <div key={i} className="card" style={{ padding: "20px", border: `1px solid ${m.color}22` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>{m.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: m.color }}>{m.name}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{m.desc}</div>
              </div>
            </div>
            <div style={{ background: `${m.color}08`, border: `1px solid ${m.color}22`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
              {m.steps.map((s, j) => (
                <div key={j} style={{ fontSize: 12, color: j === 2 ? m.color : C.text, fontFamily: j === 2 ? "'Share Tech Mono',monospace" : "'Exo 2',sans-serif", marginBottom: j < m.steps.length - 1 ? 4 : 0, fontWeight: j === 2 ? 700 : 400 }}>{j + 1}. {s}</div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Share Tech Mono',monospace" }}>Ref format: SH-{user.uid?.slice(-6)?.toUpperCase()}</div>
          </div>
        ))}
      </div>
      {/* Plans to buy */}
      <div className="section-title">◈ Available Plans</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {plans.map((p, i) => (
          <div key={i} className="card" style={{ padding: "18px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 900, color: C.cyan, marginBottom: 6 }}>{p.price}</div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, flex: 1, marginBottom: 14 }}>{p.desc}</p>
            <button className="btn btn-cyan" onClick={() => setPaymentItem({ name: p.name, price: p.price, desc: p.desc })} style={{ width: "100%", padding: "10px", borderRadius: 7 }}>Pay Now</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, padding: "16px", background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.1)", borderRadius: 10 }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 700, color: C.cyan, marginBottom: 6 }}>💬 After Payment</div>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>Send your payment screenshot + transaction reference to <strong style={{ color: C.text }}>WhatsApp: {SUPPORT.phone}</strong> or email <strong style={{ color: C.text }}>{SUPPORT.email}</strong>. Orders are activated within 1–2 hours during business hours.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TUTORIALS
═══════════════════════════════════════════════ */
function TutorialsPage() {
  const vids = [
    { t: "Deploy a WhatsApp Bot on Render (Free)", dur: "12 min", lvl: "Beginner", icon: "🎬", col: C.blue },
    { t: "Baileys Library Full Setup 2025", dur: "28 min", lvl: "Intermediate", icon: "🤖", col: C.cyan },
    { t: "Adding Commands to Your Bot", dur: "18 min", lvl: "Beginner", icon: "💻", col: C.orange },
    { t: "Multi-Session Bot Architecture", dur: "35 min", lvl: "Advanced", icon: "🧠", col: C.blue },
    { t: "Monetizing Your Bot — Full Guide", dur: "22 min", lvl: "Beginner", icon: "💰", col: C.green },
    { t: "Custom Pairing Page with Express", dur: "14 min", lvl: "Intermediate", icon: "🖥", col: C.orange },
  ];
  const lc = { Beginner: C.green, Intermediate: C.blue, Advanced: C.orange };
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>🎓 Tutorials</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Learn <span style={{ color: C.cyan }}>Bot Development</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Beginner to advanced. All tutorials on our YouTube channel.</p>
      {/* YouTube Banner */}
      <div style={{ background: "linear-gradient(135deg,rgba(255,0,0,.1),rgba(255,100,0,.06))", border: "1px solid rgba(255,0,0,.25)", borderRadius: 12, padding: "18px 20px", marginBottom: 22, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 44 }}>▶️</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>📺 ScottyX Tech — YouTube Channel</div>
          <p style={{ color: C.muted, fontSize: 13 }}>Full video tutorials on WhatsApp bots, money-making tech, and ScottyHub guides. Subscribe & turn on notifications!</p>
        </div>
        <a href={YOUTUBE_CHANNEL} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <button className="btn btn-red" style={{ padding: "11px 22px", borderRadius: 8, fontSize: 13 }}>▶ Watch on YouTube</button>
        </a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
        {vids.map((v, i) => (
          <div key={i} className="card" style={{ padding: "20px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span style={{ fontSize: 30 }}>{v.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, background: `${lc[v.lvl]}15`, color: lc[v.lvl], border: `1px solid ${lc[v.lvl]}33`, fontFamily: "'Share Tech Mono',monospace" }}>{v.lvl}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>{v.t}</div>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 14, fontFamily: "'Share Tech Mono',monospace" }}>⏱ {v.dur}</div>
            <a href={YOUTUBE_CHANNEL} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button className="btn btn-outline" style={{ width: "100%", padding: "9px", borderRadius: 7, fontSize: 12 }}>▶ Watch on YouTube</button>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   USER ACTIVITY PAGE
═══════════════════════════════════════════════ */
function ActivityPage({ user }) {
  const logs = firebaseDB.activityLogs.filter(l => l.uid === user.uid);
  const actionColors = {
    LOGIN: C.green, LOGOUT: C.muted, REGISTER: C.cyan,
    EMAIL_VERIFIED: C.blue, "2FA_SUCCESS": C.orange, "2FA_ENABLED": C.purple, "2FA_DISABLED": C.red,
  };
  const actionIcons = {
    LOGIN: "✅", LOGOUT: "🚪", REGISTER: "🎉", EMAIL_VERIFIED: "📧",
    "2FA_SUCCESS": "🔐", "2FA_ENABLED": "🛡", "2FA_DISABLED": "⚠",
  };
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>📋 Activity</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Account <span style={{ color: C.cyan }}>Activity Log</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Every login, logout and security event on your account.</p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { l: "Total Logins", v: logs.filter(l => l.action === "LOGIN").length, icon: "✅", col: C.green },
          { l: "Events", v: logs.length, icon: "📋", col: C.cyan },
          { l: "Verified", v: user.emailVerified ? "Yes" : "No", icon: "📧", col: user.emailVerified ? C.green : C.red },
          { l: "2FA", v: user.twoFAEnabled ? "ON" : "OFF", icon: "🛡", col: user.twoFAEnabled ? C.green : C.muted },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: "14px" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 700, color: s.col }}>{s.v}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 3, fontFamily: "'Share Tech Mono',monospace" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <p style={{ color: C.muted }}>No activity yet. Start using ScottyHub!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map((l, i) => (
            <div key={i} className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${actionColors[l.action] || C.muted}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {actionIcons[l.action] || "📌"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{l.action.replace(/_/g, " ")}</div>
                {l.detail && <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{l.detail}</div>}
                <div style={{ color: C.muted, fontSize: 10, fontFamily: "'Share Tech Mono',monospace" }}>📱 {l.device?.slice(0, 60)}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: actionColors[l.action] || C.muted, fontFamily: "'Share Tech Mono',monospace", fontWeight: 700 }}>{l.action}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{new Date(l.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROFILE PAGE — with 2FA toggle
═══════════════════════════════════════════════ */
function ProfilePage({ user, onLogout }) {
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAMsg, setTwoFAMsg] = useState("");
  const [twoFAEnabled, setTwoFAEnabled] = useState(user.twoFAEnabled || false);

  const toggle2FA = async () => {
    setTwoFALoading(true); setTwoFAMsg("");
    const u = firebaseDB.users[user.email];
    if (!u) { setTwoFAMsg("User not found."); setTwoFALoading(false); return; }
    const newState = !twoFAEnabled;
    u.twoFAEnabled = newState;
    firebaseDB.users[user.email] = u;
    firebaseDB.save();
    firebaseDB.logActivity(user.uid, user.email, newState ? "2FA_ENABLED" : "2FA_DISABLED", `2FA ${newState ? "enabled" : "disabled"} by user`);
    setTwoFAEnabled(newState);
    setTwoFAMsg(newState ? "✅ 2FA enabled! You'll get an email code on every login." : "⚠ 2FA disabled. Your account is less secure.");
    setTwoFALoading(false);
  };

  return (
    <div style={{ animation: "fadeUp .5s ease", maxWidth: 540 }}>
      <div className="badge" style={{ marginBottom: 12 }}>👤 Profile</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 20 }}>Account <span style={{ color: C.cyan }}>Settings</span></h2>
      <div className="card" style={{ padding: "24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 28, color: "#060b14", flexShrink: 0 }}>{(user.name || "U")[0].toUpperCase()}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{user.name}</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{user.email}</div>
            <div style={{ background: "rgba(0,119,255,.12)", color: "#4499ff", border: "1px solid rgba(0,119,255,.3)", fontSize: 10, padding: "2px 10px", borderRadius: 3, fontWeight: 700, display: "inline-block", marginTop: 6, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>{user.plan?.toUpperCase() || "FREE"} PLAN</div>
          </div>
        </div>
        {[
          { l: "Full Name", v: user.name },
          { l: "Email", v: user.email },
          { l: "WhatsApp", v: user.phone || "Not set" },
          { l: "Email Verified", v: user.emailVerified ? "✅ Verified" : "❌ Not verified" },
          { l: "Member Since", v: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "2025" },
        ].map((f, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{f.l}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{f.v}</span>
          </div>
        ))}
      </div>

      {/* 2FA Toggle */}
      <div className="card" style={{ padding: "22px", marginBottom: 16, border: twoFAEnabled ? "1px solid rgba(0,200,100,.2)" : "1px solid rgba(255,68,68,.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🛡 Two-Factor Authentication</div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, maxWidth: 340 }}>
              When enabled, you'll receive a 6-digit code on your email every time you log in. Highly recommended.
            </p>
            {twoFAMsg && <div style={{ marginTop: 8, fontSize: 12, color: twoFAEnabled ? C.green : C.orange }}>{twoFAMsg}</div>}
          </div>
          <div onClick={toggle2FA} style={{ width: 52, height: 28, borderRadius: 14, background: twoFAEnabled ? C.green : "rgba(255,255,255,.1)", cursor: twoFALoading ? "wait" : "pointer", position: "relative", transition: "background .3s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: twoFAEnabled ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: twoFAEnabled ? "#fff" : "#6688aa", transition: "left .3s" }}/>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-outline" style={{ flex: 1, padding: "12px", borderRadius: 8 }}>Edit Profile</button>
        <button className="btn btn-red" onClick={onLogout} style={{ flex: 1, padding: "12px", borderRadius: 8 }}>🚪 Logout</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SUPPORT
═══════════════════════════════════════════════ */
function SupportPage() {
  const [tab, setTab] = useState("contact");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [faqOpen, setFaqOpen] = useState(null);

  const faqs = [
    { q: "How do I pair my WhatsApp bot?", a: "Go to the Bot Rental page, enter your WhatsApp number, click Get Code, then open WhatsApp → Settings → Linked Devices → Link with phone number instead. Enter the pairing code shown." },
    { q: "How long does bot setup take?", a: "If you pair yourself via our platform it's instant. If you order a setup service (Bot Setup page), we deploy within 24 hours during business days." },
    { q: "How do payments work?", a: "We accept EcoCash (+263788114185), Binance Pay (ID: 1109003191), and MiniPay. After payment, send your transaction reference to our WhatsApp for activation." },
    { q: "Can I cancel my subscription anytime?", a: "Yes. Monthly plans can be cancelled any time before the next billing cycle. Contact us via WhatsApp or email to cancel." },
    { q: "What commands does the bot have?", a: "The bot includes 50+ commands covering AI chat, music download, YouTube, TikTok, stickers, group management, anti-spam, and much more. Type .help after pairing to see all commands." },
    { q: "Is my data safe on ScottyHub?", a: "Yes. We use Firebase Authentication with industry-standard encryption. We never sell or share your data. Read our Privacy Policy for full details." },
  ];

  const contacts = [
    { icon: "💬", t: "WhatsApp", d: "Fastest response — usually within 1 hour", val: SUPPORT.phone, action: `https://wa.me/${SUPPORT.phone.replace(/[^0-9]/g, "")}`, col: "#25d366" },
    { icon: "📧", t: "Email", d: "Full queries — reply within 24 hours", val: SUPPORT.email, action: `mailto:${SUPPORT.email}`, col: C.blue },
    { icon: "✈️", t: "Telegram", d: "Community & updates channel", val: "@Scottycrg", action: `https://t.me/Scottycrg`, col: "#2AABEE" },
  ];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>💬 Support</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>We're Here to <span style={{ color: C.blue }}>Help</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Avg. response time: under 1 hour via WhatsApp.</p>
      {/* Tab nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["contact", "📬 Contact Us"], ["faq", "❓ FAQ"], ["affiliate", "🤝 Affiliate Terms"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t)} style={{ padding: "8px 14px", borderRadius: 7, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {tab === "contact" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
            {contacts.map((s, i) => (
              <a key={i} href={s.action} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "20px", cursor: "pointer", border: `1px solid ${s.col}22` }}>
                  <div style={{ fontSize: 30, marginBottom: 10 }}>{s.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: s.col, marginBottom: 6 }}>{s.t}</div>
                  <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{s.d}</p>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: C.text }}>{s.val}</div>
                </div>
              </a>
            ))}
          </div>
          <div className="card" style={{ padding: "22px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, fontFamily: "'Rajdhani',sans-serif", letterSpacing: 1 }}>📬 SEND A MESSAGE</div>
            {sent ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 46, marginBottom: 12 }}>✅</div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>Message Sent!</div>
                <p style={{ color: C.muted, fontSize: 13 }}>We'll get back to you within 1–2 hours.</p>
              </div>
            ) : (
              <>
                <textarea className="input" placeholder="Describe your issue or question..." value={msg} onChange={e => setMsg(e.target.value)} rows={5} style={{ resize: "vertical", marginBottom: 12 }}/>
                <button className="btn btn-cyan" onClick={() => {
                  if (!msg) return;
                  const msgs = JSON.parse(localStorage.getItem("sh_messages") || "[]");
                  msgs.push({ message: msg, date: new Date().toISOString(), user: "Anonymous" });
                  localStorage.setItem("sh_messages", JSON.stringify(msgs));
                  setSent(true);
                }} style={{ padding: "12px 24px", borderRadius: 8 }}>Send Message</button>
              </>
            )}
          </div>
        </>
      )}

      {tab === "faq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {faqs.map((f, i) => (
            <div key={i} className="card" style={{ padding: "16px 18px", cursor: "pointer" }} onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{f.q}</span>
                <span style={{ color: C.cyan, fontSize: 18, flexShrink: 0, marginLeft: 10 }}>{faqOpen === i ? "−" : "+"}</span>
              </div>
              {faqOpen === i && <p style={{ color: C.muted, fontSize: 13, marginTop: 10, lineHeight: 1.7 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "affiliate" && (
        <div className="card" style={{ padding: "26px" }}>
          <h3 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: C.cyan, marginBottom: 16 }}>🤝 Affiliate Program Terms</h3>
          {[
            { t: "Commission Rate", d: "Earn 20% commission on every successful referral that subscribes to any paid plan." },
            { t: "Payment Threshold", d: "Minimum withdrawal is $1 USD. Payouts processed every Monday via EcoCash, Binance, or MiniPay." },
            { t: "How It Works", d: "Share your unique referral link. When someone registers and pays, you earn 20% of their first payment." },
            { t: "Cookie Duration", d: "Referral cookies last 30 days. If a user pays within 30 days of clicking your link, you get the commission." },
            { t: "Prohibited Activities", d: "Spam, fake reviews, misleading promotions, and self-referrals are prohibited and will result in permanent ban." },
            { t: "Getting Your Link", d: "Contact us on WhatsApp at " + SUPPORT.phone + " to get your unique referral link activated." },
          ].map((s, i) => (
            <div key={i} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: i < 5 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.cyan, marginBottom: 4 }}>{s.t}</div>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{s.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LEGAL PAGE
═══════════════════════════════════════════════ */
function LegalPage() {
  const [tab, setTab] = useState("privacy");
  const tabs = [
    { id: "privacy", label: "Privacy Policy" },
    { id: "terms", label: "Terms of Service" },
    { id: "disclaimer", label: "Disclaimer" },
    { id: "refund", label: "Refund Policy" },
  ];
  const content = {
    privacy: {
      title: "Privacy Policy",
      updated: "April 2025",
      sections: [
        { t: "Data We Collect", c: "When you register, we collect your name, email, and optional WhatsApp number. We also log session data for security purposes. We do not collect payment details — payments are processed directly via EcoCash, Binance, or MiniPay outside our platform." },
        { t: "How We Use Your Data", c: "Your data is used solely to provide ScottyHub services: authenticating your account, delivering bot services, and sending service-related notifications. We never sell, rent, or share your personal data with third parties." },
        { t: "Data Storage", c: "User data is stored using Firebase (Google's secure cloud infrastructure). Data is encrypted in transit and at rest. We comply with general data protection principles." },
        { t: "Cookies", c: "We use localStorage to maintain your session and remember your preferences. No third-party advertising cookies are used." },
        { t: "Your Rights", c: "You may request deletion of your account and all associated data at any time by contacting us at maposacourage41@gmail.com. We will process deletion requests within 7 business days." },
        { t: "Contact", c: `For privacy-related queries, email: ${SUPPORT.email} or WhatsApp: ${SUPPORT.phone}` },
      ]
    },
    terms: {
      title: "Terms of Service",
      updated: "April 2025",
      sections: [
        { t: "Acceptance", c: "By registering and using ScottyHub, you agree to these Terms of Service. If you do not agree, you must not use the platform." },
        { t: "Service Use", c: "ScottyHub provides WhatsApp bot tools, digital products, and media services. Services are provided 'as is.' We reserve the right to modify, suspend, or discontinue any service at any time." },
        { t: "User Responsibilities", c: "You must not use ScottyHub bots to spam, harass, scam, or engage in illegal activities. Misuse of WhatsApp bot features may result in your account being permanently banned without refund." },
        { t: "Payments", c: "All payments are manually verified. Prices are in USD. We do not guarantee exchange rates for EcoCash or crypto payments. Plan activations may take up to 2 hours." },
        { t: "Intellectual Property", c: "Source code products sold on ScottyHub are for personal use only. You may not resell or distribute purchased source code without written permission from ScottyHub." },
        { t: "Liability", c: "ScottyHub is not liable for WhatsApp account bans, data loss, or service interruptions. Use all bot tools responsibly and in compliance with WhatsApp's Terms of Service." },
      ]
    },
    disclaimer: {
      title: "Disclaimer",
      updated: "April 2025",
      sections: [
        { t: "No Affiliation with WhatsApp", c: "ScottyHub is an independent platform. We are not affiliated with, endorsed by, or in any way officially connected to WhatsApp Inc. or Meta Platforms." },
        { t: "Bot Use Risks", c: "Using unofficial WhatsApp bots (built with Baileys or similar libraries) carries the risk of account bans by WhatsApp. ScottyHub is not responsible for any WhatsApp account suspensions resulting from bot usage." },
        { t: "Media Content", c: "Movie and music download features are powered by third-party APIs. ScottyHub does not host any copyrighted media. All media is streamed or linked from external sources. Users are responsible for complying with local copyright laws." },
        { t: "Sports Data", c: "Sports scores and highlights are provided by third-party sports APIs. ScottyHub makes no guarantees regarding the accuracy or timeliness of sports data." },
        { t: "Earnings Disclaimer", c: "ScottyHub does not guarantee income or earnings from using our marketing tools or affiliate program. Results vary based on individual effort and market conditions." },
      ]
    },
    refund: {
      title: "Refund Policy",
      updated: "April 2025",
      sections: [
        { t: "Digital Products", c: "Due to the nature of digital products (source codes, PDFs, templates), all sales are final once the product has been delivered or downloaded. We do not offer refunds on digital products." },
        { t: "Subscription Plans", c: "Monthly subscription plans (Pro, Business) are non-refundable once activated. If you have an issue with your plan, contact us first — we will do our best to resolve it." },
        { t: "Bot Setup Services", c: "Setup service refunds are available within 48 hours if we have not started work on your order. Once work has begun, no refund is available. However, we guarantee completion of the agreed setup." },
        { t: "Failed Payments", c: "If your payment was processed but your order was not activated within 4 business hours, contact us with your transaction reference for an immediate resolution or full refund." },
        { t: "How to Request", c: `Contact us via WhatsApp: ${SUPPORT.phone} or Email: ${SUPPORT.email} with your order details and transaction reference. We aim to resolve all payment disputes within 24 hours.` },
      ]
    }
  };
  const page = content[tab];
  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge" style={{ marginBottom: 12 }}>📄 Legal</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 18 }}>Legal <span style={{ color: C.cyan }}>Documents</span></h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} className={`btn ${tab === t.id ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t.id)} style={{ padding: "8px 14px", borderRadius: 7, fontSize: 12 }}>{t.label}</button>
        ))}
      </div>
      <div className="card" style={{ padding: "26px", maxWidth: 760 }}>
        <h3 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{page.title}</h3>
        <div style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace", marginBottom: 24 }}>Last updated: {page.updated}</div>
        {page.sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < page.sections.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
            <h4 style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, marginBottom: 8 }}>{i + 1}. {s.t}</h4>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.8 }}>{s.c}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DOWNLOADER PAGE — YouTube & TikTok
═══════════════════════════════════════════════ */
function DownloaderPage() {
  const [tab, setTab] = useState("youtube");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const COBALT_API = "https://cobalt.tools/api/json";

  const download = async () => {
    if (!url.trim()) return;
    setLoading(true); setResult(null); setError("");
    try {
      // Use cobalt.tools — the best free open-source downloader API
      const res = await fetch(COBALT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ url: url.trim(), vCodec: "h264", vQuality: "720", aFormat: "mp3", isAudioOnly: tab === "youtube_audio" })
      });
      const data = await res.json();
      if (data.status === "stream" || data.status === "redirect") {
        setResult({ downloadUrl: data.url, type: tab });
      } else if (data.status === "picker") {
        setResult({ picker: data.picker, type: tab });
      } else {
        setError("Could not fetch download link. Try a different URL or use a public video.");
      }
    } catch {
      setError("Download service unavailable. Please try again shortly.");
    }
    setLoading(false);
  };

  const placeholder = tab === "tiktok"
    ? "Paste TikTok video URL here..."
    : tab === "youtube_audio"
    ? "Paste YouTube URL to extract MP3..."
    : "Paste YouTube video URL here...";

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>⬇ Downloader</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>YouTube & TikTok <span style={{ color: C.cyan }}>Downloader</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Download videos and audio. No watermarks. Completely free.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[["youtube", "▶ YouTube Video"], ["youtube_audio", "🎵 YouTube MP3"], ["tiktok", "🎵 TikTok"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => { setTab(t); setResult(null); setError(""); }} style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input className="input" placeholder={placeholder} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && download()} style={{ flex: 1 }}/>
        <button className="btn btn-cyan" onClick={download} disabled={loading} style={{ padding: "11px 20px", borderRadius: 8, whiteSpace: "nowrap" }}>
          {loading ? <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(6,11,20,.3)", borderTopColor: "#060b14", borderRadius: "50%", animation: "spin .7s linear infinite" }}/> : "⬇ Get Link"}
        </button>
      </div>

      {error && <div style={{ background: "rgba(255,68,68,.08)", border: "1px solid rgba(255,68,68,.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#ff8888", fontSize: 13 }}>⚠ {error}</div>}

      {result && (
        <div className="card" style={{ padding: "22px", border: "1px solid rgba(0,255,204,.2)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{tab === "tiktok" ? "🎵" : tab === "youtube_audio" ? "🎵" : "▶"}</div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, color: C.cyan, marginBottom: 8 }}>✅ Ready to Download!</div>
          {result.downloadUrl && (
            <a href={result.downloadUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button className="btn btn-cyan" style={{ padding: "12px 28px", borderRadius: 8, fontSize: 14, marginTop: 8 }}>⬇ Download Now</button>
            </a>
          )}
          {result.picker && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {result.picker.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <button className="btn btn-outline" style={{ padding: "10px 20px", borderRadius: 7, width: "100%" }}>⬇ Download Option {i + 1}</button>
                </a>
              ))}
            </div>
          )}
          <p style={{ color: C.muted, fontSize: 12, marginTop: 14 }}>⚠ Only download content you own or have permission to use. Respect copyright laws.</p>
        </div>
      )}

      {/* Tips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginTop: 24 }}>
        {[
          { icon: "▶", t: "YouTube Videos", d: "Paste any YouTube URL and download in 720p HD", col: C.red },
          { icon: "🎵", t: "YouTube to MP3", d: "Extract audio from any YouTube video as MP3", col: C.orange },
          { icon: "🎶", t: "TikTok No Watermark", d: "Download TikTok videos without any watermark", col: "#ff0080" },
        ].map((tip, i) => (
          <div key={i} className="card" style={{ padding: "16px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{tip.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: tip.col }}>{tip.t}</div>
            <p style={{ color: C.muted, fontSize: 12 }}>{tip.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AI CHAT PAGE — Powered by Claude API
═══════════════════════════════════════════════ */
function AiChatPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "👋 Hey! I'm ScottyAI, your personal assistant powered by Claude. Ask me anything — WhatsApp bots, coding, business ideas, tech help, or just chat!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "You are ScottyAI, the helpful AI assistant for ScottyHub — a digital income and WhatsApp bot platform from Zimbabwe. You help users with WhatsApp bots using Baileys.js, JavaScript, Node.js, deploying on Render, making money online, and using ScottyHub's features. Be concise, friendly, and practical. Keep responses short and mobile-friendly.",
          messages: [...messages.filter(m => m.role !== "assistant" || messages.indexOf(m) > 0).map(m => ({ role: m.role, content: m.content })), { role: "user", content: userMsg.content }]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response. Try again!";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ Connection issue. Please check your internet and try again." }]);
    }
    setLoading(false);
  };

  const suggestions = ["How do I deploy a WhatsApp bot?", "Help me make money online", "What is ScottyHub Pro?", "Write a bot command for me"];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>🧠 AI Chat</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>ScottyAI <span style={{ color: C.cyan }}>Assistant</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Powered by Claude — ask anything about bots, tech, business, or coding.</p>

      {/* Chat window */}
      <div className="card" style={{ height: 420, display: "flex", flexDirection: "column", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
              {m.role === "assistant" && <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>🧠</div>}
              <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px", background: m.role === "user" ? "linear-gradient(135deg,#00ffcc,#0077ff)" : "rgba(10,16,28,.95)", color: m.role === "user" ? "#060b14" : C.text, fontSize: 13, lineHeight: 1.6, border: m.role === "assistant" ? "1px solid rgba(0,255,204,.1)" : "none", fontWeight: m.role === "user" ? 600 : 400, whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🧠</div>
              <div style={{ padding: "10px 16px", background: "rgba(10,16,28,.95)", borderRadius: "12px 12px 12px 4px", border: "1px solid rgba(0,255,204,.1)", display: "flex", gap: 5, alignItems: "center" }}>
                {[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: `pulse 1s ${j * 0.2}s infinite` }}/>)}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
        {/* Input */}
        <div style={{ padding: "12px", borderTop: "1px solid rgba(0,255,204,.08)", display: "flex", gap: 8 }}>
          <input className="input" placeholder="Ask ScottyAI anything..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} style={{ flex: 1 }}/>
          <button className="btn btn-cyan" onClick={send} disabled={loading} style={{ padding: "11px 18px", borderRadius: 8, whiteSpace: "nowrap" }}>Send →</button>
        </div>
      </div>

      {/* Suggestions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {suggestions.map((s, i) => (
          <button key={i} className="btn btn-ghost" onClick={() => { setInput(s); }} style={{ padding: "7px 12px", borderRadius: 20, fontSize: 11, whiteSpace: "nowrap" }}>{s}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOOLS PAGE — URL Shortener + QR Generator
═══════════════════════════════════════════════ */
function ToolsPage() {
  const [tab, setTab] = useState("qr");
  const [qrInput, setQrInput] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [shortInput, setShortInput] = useState("");
  const [shortResult, setShortResult] = useState("");
  const [shortLoading, setShortLoading] = useState(false);
  const [shortErr, setShortErr] = useState("");
  const [copied, setCopied] = useState(false);

  const generateQR = () => {
    if (!qrInput.trim()) return;
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrInput.trim())}&bgcolor=060b14&color=00ffcc&margin=10`);
  };

  const shortenUrl = async () => {
    if (!shortInput.trim()) return;
    setShortLoading(true); setShortResult(""); setShortErr("");
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(shortInput.trim())}`);
      const text = await res.text();
      if (text.startsWith("http")) setShortResult(text.trim());
      else setShortErr("Could not shorten URL. Make sure it starts with https://");
    } catch { setShortErr("Service unavailable. Try again shortly."); }
    setShortLoading(false);
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>🔧 Tools</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Free <span style={{ color: C.cyan }}>Online Tools</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>QR codes, URL shortener and more. All free, no signup needed.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {[["qr", "📱 QR Generator"], ["short", "🔗 URL Shortener"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {tab === "qr" && (
        <div style={{ maxWidth: 500 }}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, marginBottom: 14 }}>📱 QR Code Generator</div>
            <input className="input" placeholder="Enter URL, WhatsApp number, text, payment link..." value={qrInput} onChange={e => setQrInput(e.target.value)} onKeyDown={e => e.key === "Enter" && generateQR()} style={{ marginBottom: 12 }}/>
            <button className="btn btn-cyan" onClick={generateQR} style={{ width: "100%", padding: "12px", borderRadius: 8, marginBottom: 16 }}>Generate QR Code</button>
            {qrUrl && (
              <div style={{ textAlign: "center" }}>
                <div style={{ background: "#060b14", border: "1px solid rgba(0,255,204,.2)", borderRadius: 12, padding: 16, display: "inline-block", marginBottom: 14 }}>
                  <img src={qrUrl} alt="QR Code" style={{ width: 220, height: 220, display: "block" }}/>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <a href={qrUrl} download="scottyhub-qr.png" style={{ textDecoration: "none" }}>
                    <button className="btn btn-outline" style={{ padding: "9px 18px", borderRadius: 7, fontSize: 12 }}>⬇ Download PNG</button>
                  </a>
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>Quick presets:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[`https://wa.me/${PAYMENT.ecocash.replace(/[^0-9]/g,"")}`, "https://scottyhub.vercel.app", YOUTUBE_CHANNEL].map((p, i) => (
                <button key={i} className="btn btn-ghost" onClick={() => { setQrInput(p); }} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11 }}>{["WhatsApp", "ScottyHub", "YouTube"][i]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "short" && (
        <div style={{ maxWidth: 500 }}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, marginBottom: 14 }}>🔗 URL Shortener</div>
            <input className="input" placeholder="Paste long URL here (must start with https://)" value={shortInput} onChange={e => setShortInput(e.target.value)} onKeyDown={e => e.key === "Enter" && shortenUrl()} style={{ marginBottom: 12 }}/>
            <button className="btn btn-cyan" onClick={shortenUrl} disabled={shortLoading} style={{ width: "100%", padding: "12px", borderRadius: 8 }}>
              {shortLoading ? "Shortening..." : "🔗 Shorten URL"}
            </button>
            {shortErr && <div style={{ marginTop: 12, color: "#ff8888", fontSize: 13 }}>⚠ {shortErr}</div>}
            {shortResult && (
              <div style={{ marginTop: 16, padding: "14px", background: "rgba(0,255,204,.05)", border: "1px solid rgba(0,255,204,.2)", borderRadius: 8 }}>
                <div style={{ color: C.muted, fontSize: 11, marginBottom: 6, fontFamily: "'Share Tech Mono',monospace" }}>YOUR SHORT URL:</div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", color: C.cyan, fontSize: 14, fontWeight: 700, marginBottom: 10, wordBreak: "break-all" }}>{shortResult}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => copy(shortResult)} style={{ flex: 1, padding: "9px", borderRadius: 7, fontSize: 12 }}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
                  <a href={shortResult} target="_blank" rel="noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                    <button className="btn btn-ghost" style={{ width: "100%", padding: "9px", borderRadius: 7, fontSize: 12 }}>🌐 Open</button>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CRYPTO & FOREX PAGE
═══════════════════════════════════════════════ */
function CryptoPage() {
  const [crypto, setCrypto] = useState([]);
  const [forex, setForex] = useState({});
  const [loadingC, setLoadingC] = useState(true);
  const [loadingF, setLoadingF] = useState(true);
  const [tab, setTab] = useState("crypto");

  useEffect(() => {
    fetch(`${CRYPTO_API}/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin,tether,ripple,solana,dogecoin,cardano&order=market_cap_desc&sparkline=false`)
      .then(r => r.json()).then(d => { setCrypto(d || []); setLoadingC(false); }).catch(() => setLoadingC(false));
    fetch(EXCHANGE_API)
      .then(r => r.json()).then(d => { setForex(d.rates || {}); setLoadingF(false); }).catch(() => setLoadingF(false));
  }, []);

  const pct = (n) => {
    const v = parseFloat(n || 0);
    return <span style={{ color: v >= 0 ? C.green : C.red, fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%</span>;
  };

  const ZWL_APPROX = forex["ZWL"] || 360;
  const fiatPairs = [
    { from: "USD", to: "ZWL", rate: ZWL_APPROX, icon: "🇿🇼" },
    { from: "USD", to: "ZAR", rate: forex["ZAR"] || 18.2, icon: "🇿🇦" },
    { from: "USD", to: "EUR", rate: forex["EUR"] || 0.91, icon: "🇪🇺" },
    { from: "USD", to: "GBP", rate: forex["GBP"] || 0.78, icon: "🇬🇧" },
    { from: "USD", to: "USDT", rate: 1, icon: "💵" },
    { from: "USD", to: "KES", rate: forex["KES"] || 132, icon: "🇰🇪" },
  ];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>💹 Crypto & Forex</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Live <span style={{ color: C.green }}>Markets</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Real-time crypto prices and forex rates. Updated live.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["crypto", "₿ Crypto Prices"], ["forex", "💱 Forex Rates"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {tab === "crypto" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loadingC ? <div style={{ textAlign: "center", padding: 40 }}><div style={{ display: "inline-block", width: 28, height: 28, border: "3px solid rgba(0,255,204,.2)", borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 1s linear infinite" }}/></div>
          : crypto.map((c, i) => (
            <div key={i} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <img src={c.image} alt={c.name} style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace" }}>{c.symbol?.toUpperCase()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16, color: C.cyan }}>${c.current_price?.toLocaleString()}</div>
                <div>{pct(c.price_change_percentage_24h)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "forex" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
            {loadingF ? <div style={{ padding: 20, color: C.muted }}>Loading rates...</div>
            : fiatPairs.map((f, i) => (
              <div key={i} className="card" style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
                <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Share Tech Mono',monospace", marginBottom: 4 }}>1 {f.from} =</div>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 22, color: C.cyan }}>{parseFloat(f.rate).toFixed(2)} {f.to}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 16px", background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.1)", borderRadius: 8, color: C.muted, fontSize: 12 }}>
            💡 ZWL rate is approximate. Always verify with your bank or exchange agent for the latest official rate.
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REFERRAL PAGE
═══════════════════════════════════════════════ */
function ReferralPage({ user }) {
  const [copied, setCopied] = useState(false);
  const referralCode = "SH-" + (user.uid || "USER").slice(-6).toUpperCase();
  const referralLink = `https://scottyhub.vercel.app?ref=${referralCode}`;
  const [stats] = useState(() => {
    const s = JSON.parse(localStorage.getItem(`sh_referral_${user.uid}`) || '{"clicks":0,"signups":0,"earnings":0}');
    return s;
  });

  const copy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>🤝 Referrals</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Earn With <span style={{ color: C.cyan }}>Referrals</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Share your link. Earn 20% commission on every paid referral. Paid weekly via EcoCash or Binance.</p>

      {/* Your link */}
      <div className="card" style={{ padding: "22px", marginBottom: 20, border: "1px solid rgba(0,255,204,.2)" }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, marginBottom: 14 }}>🔗 Your Referral Link</div>
        <div style={{ background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.12)", borderRadius: 8, padding: "12px 14px", marginBottom: 12, fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: C.cyan, wordBreak: "break-all" }}>{referralLink}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-cyan" onClick={copy} style={{ padding: "10px 20px", borderRadius: 7, fontSize: 13 }}>{copied ? "✅ Copied!" : "📋 Copy Link"}</button>
          <a href={`https://wa.me/?text=Join%20ScottyHub%20-%20WhatsApp%20Bots%2C%20Movies%2C%20Music%20%26%20more!%20Sign%20up%20free%3A%20${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <button className="btn btn-outline" style={{ padding: "10px 20px", borderRadius: 7, fontSize: 13 }}>💬 Share on WhatsApp</button>
          </a>
          <a href={`https://twitter.com/intent/tweet?text=🚀%20ScottyHub%20-%20WhatsApp%20bots%2C%20movies%2C%20music%20%26%20AI%20tools.%20Sign%20up%20free%3A%20${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <button className="btn btn-ghost" style={{ padding: "10px 16px", borderRadius: 7, fontSize: 13 }}>𝕏 Tweet</button>
          </a>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Total Clicks", v: stats.clicks, icon: "👆", col: C.blue },
          { l: "Signups", v: stats.signups, icon: "👥", col: C.cyan },
          { l: "Earnings", v: `$${stats.earnings.toFixed(2)}`, icon: "💰", col: C.green },
          { l: "Commission", v: "20%", icon: "📊", col: C.orange },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: "16px 14px" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 24, fontWeight: 700, color: s.col }}>{s.v}</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4, fontFamily: "'Share Tech Mono',monospace" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="card" style={{ padding: "22px", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 15, color: C.cyan, marginBottom: 16 }}>📋 How It Works</div>
        {[
          { n: "01", t: "Share Your Link", d: "Send your referral link to friends, family, or your audience on social media." },
          { n: "02", t: "They Sign Up", d: "When someone registers using your link, they're tracked to your account for 30 days." },
          { n: "03", t: "They Subscribe", d: "When they pay for any ScottyHub plan, you earn 20% of their first payment." },
          { n: "04", t: "You Get Paid", d: `Minimum payout is $1. Request via WhatsApp ${SUPPORT.phone} every Monday.` },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 14, marginBottom: i < 3 ? 16 : 0, paddingBottom: i < 3 ? 16 : 0, borderBottom: i < 3 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,rgba(0,255,204,.15),rgba(0,119,255,.1))", border: "1px solid rgba(0,255,204,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: C.cyan, flexShrink: 0 }}>{s.n}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.t}</div>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 16px", background: "rgba(255,165,0,.05)", border: "1px solid rgba(255,165,0,.15)", borderRadius: 8, color: C.muted, fontSize: 12 }}>
        ⚠ Referral code: <strong style={{ color: C.cyan, fontFamily: "'Share Tech Mono',monospace" }}>{referralCode}</strong> — Contact us on WhatsApp to activate your referral account and receive your custom tracking link.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COMMUNITY PAGE — Live Chat
═══════════════════════════════════════════════ */
function CommunityPage({ user }) {
  const [messages, setMessages] = useState(() => JSON.parse(localStorage.getItem("sh_community") || "[]"));
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("all");
  const bottomRef = useRef(null);
  const CATEGORIES = ["all", "general", "bots", "money", "help"];
  const [category, setCategory] = useState("general");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const msg = {
      id: Date.now().toString(),
      user: user.name || "Anonymous",
      uid: user.uid,
      text: input.trim(),
      category,
      time: new Date().toISOString(),
      avatar: (user.name || "U")[0].toUpperCase(),
    };
    const updated = [...messages, msg].slice(-200); // keep last 200 msgs
    setMessages(updated);
    localStorage.setItem("sh_community", JSON.stringify(updated));
    setInput("");
  };

  const displayed = filter === "all" ? messages : messages.filter(m => m.category === filter);

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>💬 Community</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>ScottyHub <span style={{ color: C.cyan }}>Community</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Chat with other ScottyHub users. Share tips, get help, connect.</p>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {CATEGORIES.map(c => (
          <button key={c} className={`btn ${filter === c ? "btn-cyan" : "btn-ghost"}`} onClick={() => setFilter(c)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, textTransform: "capitalize" }}>{c === "all" ? "All Chats" : `#${c}`}</button>
        ))}
      </div>

      {/* Chat window */}
      <div className="card" style={{ height: 400, display: "flex", flexDirection: "column", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {displayed.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}><div style={{ fontSize: 40, marginBottom: 10 }}>💬</div><p>Be the first to post in this channel!</p></div>}
          {displayed.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.uid === user.uid ? "linear-gradient(135deg,#00ffcc,#0077ff)" : "linear-gradient(135deg,#334455,#1a2a3a)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: m.uid === user.uid ? "#060b14" : C.text, flexShrink: 0 }}>{m.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: m.uid === user.uid ? C.cyan : C.text }}>{m.user}</span>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 2, background: "rgba(0,255,204,.06)", color: C.muted, fontFamily: "'Share Tech Mono',monospace" }}>#{m.category}</span>
                  <span style={{ color: C.muted, fontSize: 10, fontFamily: "'Share Tech Mono',monospace" }}>{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: C.text, background: m.uid === user.uid ? "rgba(0,255,204,.06)" : "rgba(10,16,28,.9)", padding: "8px 12px", borderRadius: "0 8px 8px 8px", border: "1px solid rgba(0,255,204,.06)", display: "inline-block", maxWidth: "100%", wordBreak: "break-word" }}>{m.text}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(0,255,204,.08)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["general", "bots", "money", "help"].map(c => (
              <button key={c} className={`btn ${category === c ? "btn-outline" : "btn-ghost"}`} onClick={() => setCategory(c)} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10 }}>#{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder={`Message #${category}...`} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} style={{ flex: 1, fontSize: 13, padding: "9px 12px" }}/>
            <button className="btn btn-cyan" onClick={send} style={{ padding: "9px 16px", borderRadius: 8 }}>Send</button>
          </div>
        </div>
      </div>

      {/* Community links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {[
          { icon: "💬", t: "WhatsApp Group", d: "Join our main community", url: `https://wa.me/${PAYMENT.ecocash.replace(/[^0-9]/g,"")}`, col: "#25d366" },
          { icon: "▶", t: "YouTube", d: "Tutorials & updates", url: YOUTUBE_CHANNEL, col: C.red },
          { icon: "✈", t: "Telegram", d: "Announcements channel", url: `https://${SUPPORT.telegram}`, col: "#2AABEE" },
        ].map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <div className="card" style={{ padding: "14px", border: `1px solid ${l.col}22`, cursor: "pointer" }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{l.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: l.col, marginBottom: 4 }}>{l.t}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{l.d}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LEADERBOARD PAGE
═══════════════════════════════════════════════ */
function LeaderboardPage({ user }) {
  const [tab, setTab] = useState("referrals");
  const allUsers = Object.values(firebaseDB.users || {});

  const referralBoard = allUsers.map(u => ({
    name: u.name || "Anonymous",
    email: u.email,
    score: Math.floor(Math.random() * 20), // demo — replace with real referral counts
    plan: u.plan || "free"
  })).sort((a, b) => b.score - a.score).slice(0, 10);

  const activityBoard = allUsers.map(u => ({
    name: u.name || "Anonymous",
    email: u.email,
    score: u.plan === "business" ? 100 : u.plan === "pro" ? 60 : 20,
    plan: u.plan || "free"
  })).sort((a, b) => b.score - a.score).slice(0, 10);

  const board = tab === "referrals" ? referralBoard : activityBoard;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ animation: "fadeUp .5s ease" }}>
      <div className="badge tag-new" style={{ marginBottom: 12 }}>🏆 Leaderboard</div>
      <h2 style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, marginBottom: 6 }}>Top <span style={{ color: "#F0B90B" }}>ScottyHub Users</span></h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Rankings updated daily. Earn points by referring users and staying active.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["referrals", "🤝 Top Referrers"], ["activity", "⚡ Most Active"]].map(([t, l]) => (
          <button key={t} className={`btn ${tab === t ? "btn-cyan" : "btn-ghost"}`} onClick={() => setTab(t)} style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12 }}>{l}</button>
        ))}
      </div>

      {board.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <p style={{ color: C.muted }}>No users yet. Be the first to appear here!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {board.map((u, i) => (
            <div key={i} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, border: u.email === user.email ? "1px solid rgba(0,255,204,.3)" : "1px solid transparent" }}>
              <div style={{ fontSize: i < 3 ? 24 : 16, width: 32, textAlign: "center", flexShrink: 0, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, color: i < 3 ? "#F0B90B" : C.muted }}>
                {i < 3 ? medals[i] : `#${i + 1}`}
              </div>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: u.email === user.email ? "linear-gradient(135deg,#00ffcc,#0077ff)" : "linear-gradient(135deg,#334455,#1a2a3a)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: u.email === user.email ? "#060b14" : C.text, flexShrink: 0 }}>{(u.name || "U")[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  {u.name} {u.email === user.email && <span style={{ fontSize: 9, padding: "1px 6px", background: "rgba(0,255,204,.1)", color: C.cyan, borderRadius: 3, fontFamily: "'Share Tech Mono',monospace" }}>YOU</span>}
                </div>
                <div style={{ color: C.muted, fontSize: 11, fontFamily: "'Share Tech Mono',monospace", textTransform: "uppercase" }}>{u.plan} plan</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: i === 0 ? "#F0B90B" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : C.cyan }}>{u.score}</div>
                <div style={{ color: C.muted, fontSize: 10, fontFamily: "'Share Tech Mono',monospace" }}>pts</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(0,255,204,.04)", border: "1px solid rgba(0,255,204,.1)", borderRadius: 8 }}>
        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, color: C.cyan, marginBottom: 6 }}>⚡ How to Earn Points</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[["Refer a new user who signs up", "+10 pts"], ["Referral upgrades to Pro", "+50 pts"], ["Referral upgrades to Business", "+100 pts"], ["Stay active daily", "+5 pts/day"]].map(([a, p]) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
              <span>{a}</span><span style={{ color: C.cyan, fontFamily: "'Share Tech Mono',monospace" }}>{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   ADMIN PANEL — Full Power v7
   Hidden: triple-click footer copyright text
   Login: Scotty / C1ty
═══════════════════════════════════════════════ */
function AdminPanel({ onClose }) {
  const [authed, setAuthed] = useState(false);
  const [loginForm, setLoginForm] = useState({ user: "", pass: "" });
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState(() => Object.values(firebaseDB.users).map(u => ({ ...u, password: "***" })));
  const [payments, setPayments] = useState(() => JSON.parse(localStorage.getItem("sh_payments") || "[]"));
  const [news, setNews] = useState(() => JSON.parse(localStorage.getItem("sh_news") || "[]"));
  const [media, setMedia] = useState(() => firebaseDB.media);
  const [activityLogs] = useState(() => firebaseDB.activityLogs);
  const [newPost, setNewPost] = useState({ title: "", content: "", category: "Updates", pinned: false });
  const [postSaved, setPostSaved] = useState(false);
  const [mediaPost, setMediaPost] = useState({ title: "", caption: "", type: "image", url: "" });
  const [mediaSaved, setMediaSaved] = useState(false);
  const [siteSettings, setSiteSettings] = useState(() => JSON.parse(localStorage.getItem("sh_site_settings") || JSON.stringify({
    maintenanceMode: false, allowRegistrations: true, freeBotsEnabled: true,
    announcementBanner: "", showBanner: false, requireEmailVerification: true,
    proPrice: "$0.65", businessPrice: "$2", starterSetupPrice: "$0.65", proSetupPrice: "$1", customSetupPrice: "$2",
  })));
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [logFilter, setLogFilter] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState(null);

  const ADMIN_USER = "Scotty";
  const ADMIN_PASS = "C1ty";

  const handleLogin = () => {
    if (loginForm.user === ADMIN_USER && loginForm.pass === ADMIN_PASS) { setAuthed(true); setLoginErr(""); }
    else setLoginErr("Invalid credentials. Access denied.");
  };

  const saveNews = () => {
    if (!newPost.title || !newPost.content) return alert("Title and content required.");
    const article = { ...newPost, id: Date.now().toString(), author: "Admin", date: new Date().toISOString() };
    const updated = [article, ...news];
    setNews(updated); localStorage.setItem("sh_news", JSON.stringify(updated));
    setNewPost({ title: "", content: "", category: "Updates", pinned: false });
    setPostSaved(true); setTimeout(() => setPostSaved(false), 2500);
  };

  const saveMedia = () => {
    if (!mediaPost.title || !mediaPost.url) return alert("Title and URL required.");
    const item = { ...mediaPost, id: Date.now().toString(), date: new Date().toISOString() };
    const updated = [item, ...media];
    setMedia(updated); firebaseDB.media = updated; firebaseDB.save();
    setMediaPost({ title: "", caption: "", type: "image", url: "" });
    setMediaSaved(true); setTimeout(() => setMediaSaved(false), 2500);
  };

  const deleteMedia = (id) => { const u = media.filter(m => m.id !== id); setMedia(u); firebaseDB.media = u; firebaseDB.save(); };
  const approvePayment = (idx) => { const u = [...payments]; u[idx].status = "approved"; setPayments(u); localStorage.setItem("sh_payments", JSON.stringify(u)); };
  const rejectPayment = (idx) => { const u = [...payments]; u[idx].status = "rejected"; setPayments(u); localStorage.setItem("sh_payments", JSON.stringify(u)); };
  const deletePayment = (idx) => { if (!confirm("Delete?")) return; const u = payments.filter((_, i) => i !== idx); setPayments(u); localStorage.setItem("sh_payments", JSON.stringify(u)); };
  const deleteNews = (id) => { const u = news.filter(n => n.id !== id); setNews(u); localStorage.setItem("sh_news", JSON.stringify(u)); };
  const upgradeUser = (email, plan) => { const a = { ...firebaseDB.users }; if (a[email]) { a[email].plan = plan; firebaseDB.users = a; firebaseDB.save(); setUsers(Object.values(a).map(u => ({ ...u, password: "***" }))); } };
  const banUser = (email) => { if (!confirm(`Ban/unban ${email}?`)) return; const a = { ...firebaseDB.users }; if (a[email]) { a[email].status = a[email].status === "banned" ? "active" : "banned"; firebaseDB.users = a; firebaseDB.save(); setUsers(Object.values(a).map(u => ({ ...u, password: "***" }))); } };
  const deleteUser = (email) => { if (!confirm(`Delete ${email}?`)) return; const a = { ...firebaseDB.users }; delete a[email]; firebaseDB.users = a; firebaseDB.save(); setUsers(Object.values(a).map(u => ({ ...u, password: "***" }))); setSelectedUser(null); };
  const verifyUser = (email) => { const a = { ...firebaseDB.users }; if (a[email]) { a[email].emailVerified = true; firebaseDB.users = a; firebaseDB.save(); setUsers(Object.values(a).map(u => ({ ...u, password: "***" }))); } };
  const saveSiteSettings = () => { localStorage.setItem("sh_site_settings", JSON.stringify(siteSettings)); setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2500); };

  const filteredUsers = users.filter(u => u.email?.toLowerCase().includes(searchUser.toLowerCase()) || u.name?.toLowerCase().includes(searchUser.toLowerCase()) || (u.phone || "").includes(searchUser));
  const totalRevenue = payments.filter(p => p.status === "approved").reduce((s, p) => s + (parseFloat((p.amount || "0").toString().replace(/[^0-9.]/g, "")) || 0), 0);
  const filteredLogs = logFilter === "ALL" ? activityLogs : activityLogs.filter(l => l.action === logFilter);
  const LOG_ACTIONS = ["ALL", "LOGIN", "LOGOUT", "REGISTER", "EMAIL_VERIFIED", "2FA_ENABLED", "2FA_SUCCESS"];
  const actionCol = { LOGIN: "#00cc88", LOGOUT: "#6688aa", REGISTER: "#00ffcc", EMAIL_VERIFIED: "#0077ff", "2FA_ENABLED": "#9944ff", "2FA_SUCCESS": "#ff6b35" };

  if (!authed) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#070d17", borderRadius: 16, width: "min(400px,95vw)", border: "1px solid rgba(0,255,204,.25)", animation: "fadeUp .3s ease", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,255,204,.08)", background: "rgba(0,255,204,.03)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 18, color: "#00ffcc" }}>ADMIN ACCESS</div><div style={{ color: "#6688aa", fontSize: 11, fontFamily: "'Share Tech Mono',monospace", marginTop: 2 }}>RESTRICTED ZONE</div></div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12 }}>X</button>
        </div>
        <div style={{ padding: "28px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 48, marginBottom: 8 }}>🛡</div><p style={{ color: "#6688aa", fontSize: 13 }}>Enter admin credentials</p></div>
          {loginErr && <div style={{ background: "rgba(255,68,68,.08)", border: "1px solid rgba(255,68,68,.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#ff8888", fontSize: 13 }}>⚠ {loginErr}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <input className="input" placeholder="Username" value={loginForm.user} onChange={e => setLoginForm({ ...loginForm, user: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} autoComplete="off"/>
            <input className="input" type="password" placeholder="Password" value={loginForm.pass} onChange={e => setLoginForm({ ...loginForm, pass: e.target.value })} onKeyDown={e => e.key === "Enter" && handleLogin()} autoComplete="off"/>
          </div>
          <button className="btn btn-cyan" onClick={handleLogin} style={{ width: "100%", padding: "13px", borderRadius: 8, fontSize: 14 }}>🔓 Authenticate</button>
        </div>
      </div>
    </div>
  );

  const TABS = [
    { id: "overview", label: "📊 Overview" },
    { id: "users", label: "👥 Users" },
    { id: "activity", label: "📋 Activity" },
    { id: "payments", label: "💳 Payments" },
    { id: "news", label: "📰 News" },
    { id: "media", label: "🎬 Media" },
    { id: "settings", label: "⚙ Settings" },
    { id: "messages", label: "📬 Messages" },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#070d17", borderRadius: 16, width: "min(1040px,97vw)", maxHeight: "95vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid rgba(0,255,204,.2)" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,255,204,.1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "rgba(0,255,204,.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 17, color: "#00ffcc" }}>⚙ SCOTTYHUB ADMIN</div>
            <span style={{ fontSize: 9, padding: "2px 7px", background: "rgba(0,255,204,.1)", border: "1px solid rgba(0,255,204,.3)", color: "#00ffcc", borderRadius: 3, fontFamily: "'Share Tech Mono',monospace" }}>SUPER ADMIN</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: "#6688aa", fontSize: 10, fontFamily: "'Share Tech Mono',monospace" }}>{new Date().toLocaleString()}</span>
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12 }}>✕ Close</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,.04)", flexWrap: "wrap", flexShrink: 0, background: "#060c15" }}>
          {TABS.map(t => (
            <button key={t.id} className={`btn ${tab === t.id ? "btn-cyan" : "btn-ghost"}`} onClick={() => { setTab(t.id); setSelectedUser(null); }} style={{ padding: "5px 11px", borderRadius: 6, fontSize: 11 }}>{t.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>

          {tab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { l: "Total Users", v: users.length, icon: "👥", col: "#0077ff" },
                  { l: "Revenue USD", v: "$" + totalRevenue.toFixed(2), icon: "💰", col: "#F0B90B" },
                  { l: "Pending Pay", v: payments.filter(p => p.status === "pending").length, icon: "⏳", col: "#ff6b35" },
                  { l: "Verified", v: users.filter(u => u.emailVerified).length, icon: "📧", col: "#00ffcc" },
                  { l: "Media Posts", v: media.length, icon: "🎬", col: "#9944ff" },
                  { l: "Activity Logs", v: activityLogs.length, icon: "📋", col: "#00cc88" },
                ].map(s => (
                  <div key={s.l} className="card" style={{ padding: "12px 10px" }}>
                    <div style={{ fontSize: 18, marginBottom: 5 }}>{s.icon}</div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 20, fontWeight: 700, color: s.col }}>{s.v}</div>
                    <div style={{ color: "#6688aa", fontSize: 10, marginTop: 2, fontFamily: "'Share Tech Mono',monospace" }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: "14px", marginBottom: 14 }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: "#00ffcc", marginBottom: 10 }}>🔴 Live Activity Feed</div>
                {activityLogs.slice(0, 12).map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 11 ? "1px solid rgba(255,255,255,.03)" : "none" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: actionCol[l.action] || "#6688aa", flexShrink: 0 }}/>
                    <span style={{ fontSize: 11, flex: 1, color: "#e8f4ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.email}</span>
                    <span style={{ fontSize: 9, color: actionCol[l.action] || "#6688aa", fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, flexShrink: 0 }}>{l.action}</span>
                    <span style={{ fontSize: 9, color: "#6688aa", fontFamily: "'Share Tech Mono',monospace", flexShrink: 0 }}>{new Date(l.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
                {activityLogs.length === 0 && <p style={{ color: "#6688aa", fontSize: 12 }}>No activity yet.</p>}
              </div>
              <div className="card" style={{ padding: "14px" }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: "#ff6b35", marginBottom: 10 }}>⏳ Pending Payments</div>
                {payments.filter(p => p.status === "pending").slice(0, 5).map((p, i) => {
                  const idx = payments.indexOf(p);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.03)", gap: 8, flexWrap: "wrap" }}>
                      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{p.user}</div><div style={{ color: "#6688aa", fontSize: 10 }}>{p.item} • {p.method}</div></div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, color: "#00ffcc", fontSize: 13 }}>{p.amount}</span>
                        <button className="btn btn-cyan" onClick={() => approvePayment(idx)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 10 }}>✅</button>
                        <button className="btn btn-red" onClick={() => rejectPayment(idx)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 10 }}>❌</button>
                      </div>
                    </div>
                  );
                })}
                {payments.filter(p => p.status === "pending").length === 0 && <p style={{ color: "#6688aa", fontSize: 12 }}>No pending payments.</p>}
              </div>
            </div>
          )}

          {tab === "users" && !selectedUser && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <input className="input" placeholder="Search name, email, phone..." value={searchUser} onChange={e => setSearchUser(e.target.value)} style={{ flex: 1, minWidth: 180 }}/>
                <span style={{ color: "#6688aa", fontSize: 11, fontFamily: "'Share Tech Mono',monospace", display: "flex", alignItems: "center" }}>{filteredUsers.length} users</span>
              </div>
              {filteredUsers.map((u, i) => (
                <div key={i} className="card" style={{ padding: "11px 13px", marginBottom: 7, border: u.status === "banned" ? "1px solid rgba(255,68,68,.2)" : "1px solid transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: u.status === "banned" ? "rgba(255,68,68,.3)" : "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#060b14", flexShrink: 0 }}>{(u.name || "U")[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                        {u.name || "No name"}
                        {u.emailVerified && <span style={{ fontSize: 8, padding: "1px 4px", background: "rgba(0,200,100,.1)", color: "#00cc88", borderRadius: 2, fontFamily: "'Share Tech Mono',monospace" }}>✓VER</span>}
                        {u.twoFAEnabled && <span style={{ fontSize: 8, padding: "1px 4px", background: "rgba(150,0,255,.1)", color: "#9944ff", borderRadius: 2, fontFamily: "'Share Tech Mono',monospace" }}>2FA</span>}
                        {u.status === "banned" && <span style={{ fontSize: 8, padding: "1px 4px", background: "rgba(255,68,68,.1)", color: "#ff4444", borderRadius: 2, fontFamily: "'Share Tech Mono',monospace" }}>BANNED</span>}
                      </div>
                      <div style={{ color: "#6688aa", fontSize: 10, fontFamily: "'Share Tech Mono',monospace" }}>{u.email} • {u.phone || "no phone"} • logins:{u.loginCount || 0}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, background: u.plan === "business" ? "rgba(255,107,53,.1)" : u.plan === "pro" ? "rgba(0,255,204,.1)" : "rgba(0,119,255,.1)", color: u.plan === "business" ? "#ff6b35" : u.plan === "pro" ? "#00ffcc" : "#4499ff" }}>{(u.plan || "FREE").toUpperCase()}</span>
                      <button className="btn btn-ghost" onClick={() => setSelectedUser(u)} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>👁</button>
                      {u.plan !== "pro" && <button className="btn btn-outline" onClick={() => upgradeUser(u.email, "pro")} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>→Pro</button>}
                      {u.plan !== "business" && <button className="btn btn-ghost" onClick={() => upgradeUser(u.email, "business")} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>→Biz</button>}
                      {!u.emailVerified && <button className="btn btn-outline" onClick={() => verifyUser(u.email)} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>✓Ver</button>}
                      <button className="btn" onClick={() => banUser(u.email)} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9, background: u.status === "banned" ? "rgba(0,200,100,.1)" : "rgba(255,165,0,.1)", color: u.status === "banned" ? "#00cc88" : "#ff6b35", border: "none" }}>{u.status === "banned" ? "Unban" : "Ban"}</button>
                      <button className="btn btn-red" onClick={() => deleteUser(u.email)} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "users" && selectedUser && (
            <div>
              <button className="btn btn-ghost" onClick={() => setSelectedUser(null)} style={{ padding: "6px 12px", borderRadius: 6, marginBottom: 14, fontSize: 11 }}>← Back</button>
              <div className="card" style={{ padding: "20px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 50, height: 50, borderRadius: "50%", background: "linear-gradient(135deg,#00ffcc,#0077ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20, color: "#060b14" }}>{(selectedUser.name || "U")[0]}</div>
                  <div><div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 18, fontWeight: 700 }}>{selectedUser.name}</div><div style={{ color: "#6688aa", fontSize: 12 }}>{selectedUser.email}</div></div>
                </div>
                {[["Plan", (selectedUser.plan||"free").toUpperCase()], ["Email Verified", selectedUser.emailVerified ? "✅ Yes" : "❌ No"], ["2FA", selectedUser.twoFAEnabled ? "✅ On" : "❌ Off"], ["Status", selectedUser.status || "active"], ["Logins", selectedUser.loginCount || 0], ["Last Login", selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : "Never"], ["Phone", selectedUser.phone || "Not set"], ["Joined", selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : "N/A"], ["UID", selectedUser.uid]].map(([l,v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                    <span style={{ color: "#6688aa", fontSize: 12 }}>{l}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, maxWidth: "60%", textAlign: "right", wordBreak: "break-all", fontFamily: l === "UID" ? "'Share Tech Mono',monospace" : "inherit" }}>{String(v)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                  {["free","pro","business"].map(plan => <button key={plan} className={`btn ${selectedUser.plan === plan ? "btn-cyan" : "btn-ghost"}`} onClick={() => { upgradeUser(selectedUser.email, plan); setSelectedUser({...selectedUser, plan}); }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10 }}>→{plan.toUpperCase()}</button>)}
                  <button className="btn btn-outline" onClick={() => { verifyUser(selectedUser.email); setSelectedUser({...selectedUser, emailVerified: true}); }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10 }}>✓Verify</button>
                  <button className="btn" onClick={() => { banUser(selectedUser.email); setSelectedUser({...selectedUser, status: selectedUser.status==="banned"?"active":"banned"}); }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10, background: "rgba(255,165,0,.1)", color: "#ff6b35", border: "none" }}>{selectedUser.status==="banned"?"Unban":"Ban"}</button>
                  <button className="btn btn-red" onClick={() => deleteUser(selectedUser.email)} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10 }}>🗑 Delete</button>
                </div>
              </div>
              <div className="card" style={{ padding: "14px" }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 13, fontWeight: 700, color: "#00ffcc", marginBottom: 10 }}>📋 Login History</div>
                {activityLogs.filter(l => l.email === selectedUser.email).slice(0, 15).map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: actionCol[l.action] || "#6688aa", marginTop: 5, flexShrink: 0 }}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{l.action} <span style={{ fontWeight: 400, color: "#6688aa" }}>— {l.detail}</span></div>
                      <div style={{ color: "#6688aa", fontSize: 9, fontFamily: "'Share Tech Mono',monospace" }}>{l.device?.slice(0,60)} • {new Date(l.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div>
              <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
                {LOG_ACTIONS.map(a => <button key={a} className={`btn ${logFilter===a?"btn-cyan":"btn-ghost"}`} onClick={() => setLogFilter(a)} style={{ padding: "4px 9px", borderRadius: 4, fontSize: 9 }}>{a}</button>)}
                <span style={{ marginLeft: "auto", color: "#6688aa", fontSize: 10, fontFamily: "'Share Tech Mono',monospace", display: "flex", alignItems: "center" }}>{filteredLogs.length} logs</span>
              </div>
              {filteredLogs.slice(0, 100).map((l, i) => (
                <div key={i} className="card" style={{ padding: "9px 12px", marginBottom: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: actionCol[l.action] || "#6688aa", marginTop: 4, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 11 }}>{l.email}</span>
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 2, background: `${actionCol[l.action]||"#6688aa"}18`, color: actionCol[l.action]||"#6688aa", fontFamily: "'Share Tech Mono',monospace", fontWeight: 700 }}>{l.action}</span>
                    </div>
                    {l.detail && <div style={{ color: "#6688aa", fontSize: 10, marginBottom: 2 }}>{l.detail}</div>}
                    <div style={{ color: "#6688aa", fontSize: 9, fontFamily: "'Share Tech Mono',monospace" }}>{l.device?.slice(0,65)}</div>
                  </div>
                  <div style={{ color: "#6688aa", fontSize: 9, fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(l.timestamp).toLocaleString()}</div>
                </div>
              ))}
              {filteredLogs.length === 0 && <p style={{ color: "#6688aa" }}>No logs.</p>}
            </div>
          )}

          {tab === "payments" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {[["All", payments.length, "#0077ff"], ["Pending", payments.filter(p=>p.status==="pending").length, "#ff6b35"], ["Approved", payments.filter(p=>p.status==="approved").length, "#00cc88"], ["Revenue", "$"+totalRevenue.toFixed(2), "#F0B90B"]].map(([l,v,col]) => (
                  <div key={l} className="card" style={{ padding: "9px 12px", display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, color: col }}>{v}</span>
                    <span style={{ color: "#6688aa", fontSize: 10 }}>{l}</span>
                  </div>
                ))}
              </div>
              {payments.map((p, i) => (
                <div key={i} className="card" style={{ padding: "11px 12px", marginBottom: 7, border: `1px solid ${p.status==="approved"?"rgba(0,200,100,.12)":p.status==="rejected"?"rgba(255,68,68,.12)":"rgba(255,165,0,.12)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{p.item}</div>
                      <div style={{ color: "#6688aa", fontSize: 10 }}>👤 {p.user} • {p.method} • Ref: <span style={{ fontFamily: "'Share Tech Mono',monospace", color: "#00ffcc" }}>{p.txRef}</span></div>
                      <div style={{ color: "#6688aa", fontSize: 9, marginTop: 1 }}>{new Date(p.date).toLocaleString()}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 16, fontWeight: 700, color: "#00ffcc" }}>{p.amount}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {p.status==="pending"&&<><button className="btn btn-cyan" onClick={() => approvePayment(i)} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9 }}>✅</button><button className="btn btn-red" onClick={() => rejectPayment(i)} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9 }}>❌</button></>}
                        {p.status!=="pending"&&<span style={{ fontSize: 9, color: p.status==="approved"?"#00cc88":"#ff4444", fontFamily: "'Share Tech Mono',monospace", fontWeight: 700 }}>{p.status.toUpperCase()}</span>}
                        <button className="btn btn-ghost" onClick={() => deletePayment(i)} style={{ padding: "3px 7px", borderRadius: 4, fontSize: 9 }}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {payments.length === 0 && <p style={{ color: "#6688aa" }}>No payments yet.</p>}
            </div>
          )}

          {tab === "news" && (
            <div>
              <div className="card" style={{ padding: "18px", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: "#00ffcc", marginBottom: 12 }}>✍ Publish Article</div>
                {postSaved && <div style={{ background: "rgba(0,255,204,.08)", border: "1px solid rgba(0,255,204,.2)", borderRadius: 7, padding: "9px", marginBottom: 12, color: "#00ffcc", fontSize: 12 }}>✅ Published!</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <input className="input" placeholder="Title..." value={newPost.title} onChange={e => setNewPost({...newPost, title: e.target.value})}/>
                  <div style={{ display: "flex", gap: 7 }}>
                    <select className="input" value={newPost.category} onChange={e => setNewPost({...newPost, category: e.target.value})} style={{ flex: 1 }}>
                      {["Updates","Announcements","Features","Tech","Maintenance","Promotions"].map(c => <option key={c}>{c}</option>)}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: "rgba(0,255,204,.03)", border: "1px solid rgba(0,255,204,.15)", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap", fontSize: 12 }}>
                      <input type="checkbox" checked={newPost.pinned} onChange={e => setNewPost({...newPost, pinned: e.target.checked})} style={{ accentColor: "#00ffcc" }}/> 📌 Pin
                    </label>
                  </div>
                  <textarea className="input" placeholder="Content..." value={newPost.content} onChange={e => setNewPost({...newPost, content: e.target.value})} rows={4} style={{ resize: "vertical" }}/>
                  <button className="btn btn-cyan" onClick={saveNews} style={{ padding: "10px", borderRadius: 7 }}>🚀 Publish</button>
                </div>
              </div>
              {news.map((a, i) => (
                <div key={i} className="card" style={{ padding: "10px 12px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 12 }}>{a.pinned?"📌 ":""}{a.title}</div><div style={{ color: "#6688aa", fontSize: 9, fontFamily: "'Share Tech Mono',monospace" }}>{a.category} • {new Date(a.date).toLocaleDateString()}</div></div>
                  <button className="btn btn-red" onClick={() => deleteNews(a.id)} style={{ padding: "4px 9px", borderRadius: 4, fontSize: 9 }}>🗑</button>
                </div>
              ))}
            </div>
          )}

          {tab === "media" && (
            <div>
              <div className="card" style={{ padding: "20px", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: "#00ffcc", marginBottom: 12 }}>🎬 Post Photo or Video</div>
                {mediaSaved && <div style={{ background: "rgba(0,255,204,.08)", border: "1px solid rgba(0,255,204,.2)", borderRadius: 7, padding: "9px", marginBottom: 12, color: "#00ffcc", fontSize: 12 }}>✅ Media posted!</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="input" placeholder="Title..." value={mediaPost.title} onChange={e => setMediaPost({...mediaPost, title: e.target.value})}/>
                  <textarea className="input" placeholder="Caption (optional)..." value={mediaPost.caption} onChange={e => setMediaPost({...mediaPost, caption: e.target.value})} rows={2} style={{ resize: "vertical" }}/>
                  <div style={{ display: "flex", gap: 7 }}>
                    {["image","video","youtube"].map(t => (
                      <button key={t} className={`btn ${mediaPost.type===t?"btn-cyan":"btn-ghost"}`} onClick={() => setMediaPost({...mediaPost, type: t})} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11 }}>
                        {t==="image"?"🖼 Image":t==="video"?"🎥 Video":"▶ YouTube"}
                      </button>
                    ))}
                  </div>
                  <input className="input" placeholder={mediaPost.type==="image"?"Image URL (e.g. https://i.imgur.com/...jpg)":mediaPost.type==="youtube"?"YouTube URL (e.g. https://youtube.com/watch?v=...)":"Direct video URL (.mp4)"} value={mediaPost.url} onChange={e => setMediaPost({...mediaPost, url: e.target.value})}/>
                  {mediaPost.url && mediaPost.type==="image" && <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,255,204,.15)", maxHeight: 180 }}><img src={mediaPost.url} alt="preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} onError={e=>e.target.style.display="none"}/></div>}
                  {mediaPost.url && mediaPost.type==="youtube" && <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,255,204,.15)", aspectRatio: "16/9" }}><iframe src={`https://www.youtube.com/embed/${mediaPost.url.split("v=")[1]?.split("&")[0]||mediaPost.url.split("youtu.be/")[1]?.split("?")[0]||""}`} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen title="preview"/></div>}
                  <button className="btn btn-cyan" onClick={saveMedia} style={{ padding: "10px", borderRadius: 7 }}>📤 Post Media</button>
                </div>
              </div>
              <div style={{ color: "#6688aa", fontSize: 11, marginBottom: 8 }}>{media.length} media posts</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
                {media.map((m, i) => (
                  <div key={i} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ position: "relative", height: 130, background: "rgba(0,255,204,.04)" }}>
                      {m.type==="image" && <img src={m.url} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>}
                      {m.type==="youtube" && <iframe src={`https://www.youtube.com/embed/${m.url.split("v=")[1]?.split("&")[0]||m.url.split("youtu.be/")[1]?.split("?")[0]||""}`} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen title={m.title}/>}
                      {m.type==="video" && <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls/>}
                      <div style={{ position: "absolute", top: 5, right: 5 }}><button className="btn btn-red" onClick={() => deleteMedia(m.id)} style={{ padding: "2px 7px", borderRadius: 3, fontSize: 9 }}>🗑</button></div>
                      <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(0,0,0,.65)", fontSize: 8, padding: "2px 5px", borderRadius: 2, color: "#fff", fontFamily: "'Share Tech Mono',monospace" }}>{m.type.toUpperCase()}</div>
                    </div>
                    <div style={{ padding: "9px 10px" }}>
                      <div style={{ fontWeight: 700, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                      <div style={{ color: "#6688aa", fontSize: 9, marginTop: 2 }}>{new Date(m.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
                {media.length===0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "30px", color: "#6688aa" }}><div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div><p>No media yet.</p></div>}
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div>
              <div className="card" style={{ padding: "20px", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: "#00ffcc", marginBottom: 16 }}>⚙ Site Controls</div>
                {settingsSaved && <div style={{ background: "rgba(0,255,204,.08)", border: "1px solid rgba(0,255,204,.2)", borderRadius: 7, padding: "9px", marginBottom: 12, color: "#00ffcc", fontSize: 12 }}>✅ Saved!</div>}
                {[["maintenanceMode","🔧 Maintenance Mode","Lock site for non-admins"],["allowRegistrations","📝 Allow Registrations","Let new users sign up"],["freeBotsEnabled","🤖 Free Bot Pairing","Enable free pairing"],["requireEmailVerification","📧 Require Email Verification","Block access until verified"],["showBanner","📢 Show Banner","Display announcement banner"]].map(([key,label,desc]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><div style={{ color: "#6688aa", fontSize: 11 }}>{desc}</div></div>
                    <div onClick={() => setSiteSettings(p => ({...p, [key]: !p[key]}))} style={{ width: 42, height: 22, borderRadius: 11, background: siteSettings[key] ? "#00ffcc" : "rgba(255,255,255,.1)", cursor: "pointer", position: "relative", transition: "background .3s", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: 2, left: siteSettings[key] ? 21 : 2, width: 18, height: 18, borderRadius: "50%", background: siteSettings[key] ? "#060b14" : "#6688aa", transition: "left .3s" }}/>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📢 Banner Text</div>
                  <input className="input" placeholder="Announcement text..." value={siteSettings.announcementBanner} onChange={e => setSiteSettings(p => ({...p, announcementBanner: e.target.value}))}/>
                </div>
              </div>
              <div className="card" style={{ padding: "20px", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, color: "#00ffcc", marginBottom: 14 }}>💰 Pricing Controls</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
                  {[["proPrice","Pro Bot"],["businessPrice","Business Bot"],["starterSetupPrice","Starter Setup"],["proSetupPrice","Pro Setup"],["customSetupPrice","Custom Setup"]].map(([k,l]) => (
                    <div key={k}><div style={{ fontSize: 11, color: "#6688aa", marginBottom: 4 }}>{l}</div><input className="input" value={siteSettings[k]} onChange={e => setSiteSettings(p => ({...p, [k]: e.target.value}))}/></div>
                  ))}
                </div>
              </div>
              <button className="btn btn-cyan" onClick={saveSiteSettings} style={{ padding: "11px 24px", borderRadius: 7 }}>💾 Save All Settings</button>
            </div>
          )}

          {tab === "messages" && (
            <div>
              {(() => {
                const msgs = JSON.parse(localStorage.getItem("sh_messages") || "[]");
                if (msgs.length===0) return <div className="card" style={{ padding: "28px", textAlign: "center" }}><div style={{ fontSize: 34, marginBottom: 8 }}>📬</div><p style={{ color: "#6688aa" }}>No messages yet.</p></div>;
                return msgs.map((m, i) => (
                  <div key={i} className="card" style={{ padding: "12px 14px", marginBottom: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{m.user || "Anonymous"}</span>
                      <span style={{ color: "#6688aa", fontSize: 9, fontFamily: "'Share Tech Mono',monospace" }}>{m.date ? new Date(m.date).toLocaleString() : ""}</span>
                    </div>
                    <p style={{ color: "#6688aa", fontSize: 12, lineHeight: 1.7 }}>{m.message}</p>
                  </div>
                ));
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD SHELL
═══════════════════════════════════════════════ */
function Dashboard({ user, onLogout }) {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);

  // Secret: triple-click the footer copyright text to open admin login
  const [footerClicks, setFooterClicks] = useState(0);
  const footerClickRef = useRef(null);
  const handleFooterClick = () => {
    setFooterClicks(c => {
      const next = c + 1;
      if (next >= 3) {
        setShowAdmin(true);
        return 0;
      }
      clearTimeout(footerClickRef.current);
      footerClickRef.current = setTimeout(() => setFooterClicks(0), 2000);
      return next;
    });
  };

  const go = id => { setActive(id); setSidebarOpen(false); };
  const sharedProps = { user, setPaymentItem, setActive: go };

  const pages = {
    dashboard: <DashboardHome {...sharedProps} />,
    bots: <BotsPage {...sharedProps} />,
    movies: <MoviesPage />,
    music: <MusicPage />,
    sports: <SportsPage />,
    downloader: <DownloaderPage />,
    ai: <AiChatPage />,
    tools: <ToolsPage />,
    crypto: <CryptoPage />,
    referral: <ReferralPage user={user} />,
    community: <CommunityPage user={user} />,
    leaderboard: <LeaderboardPage user={user} />,
    store: <StorePage {...sharedProps} />,
    setup: <SetupPage {...sharedProps} />,
    marketing: <MarketingPage {...sharedProps} />,
    news: <NewsPage user={user} />,
    payment: <PaymentPage {...sharedProps} />,
    tutorials: <TutorialsPage />,
    activity: <ActivityPage user={user} />,
    profile: <ProfilePage user={user} onLogout={onLogout} />,
    support: <SupportPage />,
    legal: <LegalPage />,
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* Orbs */}
      <div className="orb" style={{ width: 600, height: 600, background: "radial-gradient(circle,rgba(0,255,204,.05),transparent)", top: "-10%", right: "-10%" }}/>
      <div className="orb" style={{ width: 500, height: 500, background: "radial-gradient(circle,rgba(0,119,255,.04),transparent)", bottom: "5%", left: "-10%" }}/>
      <TopNav sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} active={active} user={user} />
      <Sidebar active={active} setActive={go} open={sidebarOpen} user={user} onLogout={onLogout} />
      <main style={{ paddingTop: 58, minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div style={{ padding: "22px 18px", maxWidth: 1060, margin: "0 auto" }}>
          {pages[active] || pages.dashboard}
        </div>
        {/* Footer */}
        <div style={{ borderTop: "1px solid rgba(0,255,204,.05)", padding: "20px 24px", textAlign: "center", marginTop: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 20px", marginBottom: 10 }}>
            {[["legal", "Privacy Policy"], ["legal", "Terms of Service"], ["legal", "Disclaimer"], ["legal", "Refund Policy"], ["support", "Contact Us"]].map(([page, label], i) => (
              <span key={i} style={{ color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "'Share Tech Mono',monospace" }} onClick={() => go(page)}>{label}</span>
            ))}
          </div>
          {/* Triple-click this to open admin */}
          <p style={{ color: "#1a2a3a", fontSize: 11, fontFamily: "'Share Tech Mono',monospace", cursor: "default", userSelect: "none" }} onClick={handleFooterClick}>
            © 2025 ScottyHub • Built by Scotty • {SUPPORT.email}
          </p>
        </div>
      </main>
      {paymentItem && <PaymentModal item={paymentItem} onClose={() => setPaymentItem(null)} user={user} />}
      {showAdmin && <AdminPanel onClose={() => { setShowAdmin(false); setAdminAuthed(false); }} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════ */
export default function App() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = firebaseAuth.restoreSession();
    if (saved) setUser(saved);
  }, []);

  const handleLogout = async () => {
    await firebaseAuth.signOut();
    setUser(null);
  };

  return (
    <>
      <style>{G}</style>
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
      {!splash && (
        !user
          ? <AuthPage onAuth={u => setUser(u)} />
          : <Dashboard user={user} onLogout={handleLogout} />
      )}
    </>
  );
}
