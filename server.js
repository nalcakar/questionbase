const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const PatreonStrategy = require("passport-patreon").Strategy;
const { OpenAI } = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

// ✅ CORS
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://questionbase-o6jk.onrender.com"
  ],
  credentials: true
}));

// ✅ JSON + Statik Dosyalar
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ SESSION Ayarı (Render için uygun)
app.use(session({
  secret: process.env.SESSION_SECRET || "keyboard cat",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd, // Render HTTPS → true
    sameSite: isProd ? "none" : "lax"
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ✅ Kullanıcıyı serialize/deserialize et
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// ✅ Patreon Strategy
passport.use(new PatreonStrategy({
  clientID: process.env.PATREON_CLIENT_ID,
  clientSecret: process.env.PATREON_CLIENT_SECRET,
  callbackURL: isProd
    ? "https://questionbase-o6jk.onrender.com/auth/patreon/callback"
    : "http://localhost:3001/auth/patreon/callback",
  scope: ['identity', 'identity.memberships']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const parsed = JSON.parse(profile._raw);
    profile.rawJson = parsed;
    console.log("🔍 Giriş yapan kullanıcı:", JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error("❌ JSON parse hatası:", e);
  }

  return done(null, profile);
}));

// ✅ Giriş Başlat
app.get("/auth/patreon", passport.authenticate("patreon"));

// ✅ Giriş Callback
app.get("/auth/patreon/callback",
  passport.authenticate("patreon", {
    failureRedirect: "/login-failed",
    successRedirect: "/"
  })
);

// ✅ Giriş Başarısız
app.get("/login-failed", (req, res) => {
  res.send(`<h2>❌ Giriş başarısız oldu</h2><a href="/">🔙 Ana sayfa</a>`);
});

// ✅ Üyelik Durumu
app.get("/me", (req, res) => {
  if (!req.isAuthenticated()) return res.json({ isLoggedIn: false });

  const raw = req.user.rawJson || {};
  const included = raw?.included || [];
  const relationships = raw?.data?.relationships || {};
  const pledges = relationships.pledges?.data || [];

  const isActiveInIncluded = included.some(item =>
    item?.attributes?.patron_status === "active_patron"
  );

  const hasPledges = Array.isArray(pledges) && pledges.length > 0;
  const isForced = process.env.FORCE_PATRON === "true";

  const isPatron = isActiveInIncluded || hasPledges || isForced;

  const email = req.user?.email || raw?.data?.attributes?.email || null;
  const name = req.user.displayName || raw?.data?.attributes?.full_name || "Kullanıcı";

  res.json({
    isLoggedIn: true,
    isPatron,
    name,
    email
  });
});

// ✅ Çıkış
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// ✅ OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/openai", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt boş olamaz." });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1500
    });

    const reply = completion.choices[0].message.content.trim();
    res.json({ reply });
  } catch (error) {
    console.error("OpenAI API hatası:", error.message);
    res.status(500).json({ error: "OpenAI isteği başarısız oldu." });
  }
});

// ✅ Sunucuyu Başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
