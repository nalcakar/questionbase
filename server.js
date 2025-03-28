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

// ⭐️ CORS ayarı (localhost ve Render)
app.use(cors({
  origin: ["http://localhost:3000", "https://questionbase-o6jk.onrender.com"],
  credentials: true
}));

// ⭐️ JSON ve statik dosyalar
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ⭐️ Oturum (session) ayarları
app.use(session({
  secret: process.env.SESSION_SECRET || "keyboard cat",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Render’da true yapılmalı
    sameSite: "lax"
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ⭐️ Passport serialize işlemleri
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// ⭐️ Patreon OAuth Stratejisi
const isProd = process.env.NODE_ENV === "production";

passport.use(new PatreonStrategy({
  clientID: process.env.PATREON_CLIENT_ID,
  clientSecret: process.env.PATREON_CLIENT_SECRET,
  callbackURL: isProd
    ? "https://questionbase-o6jk.onrender.com/auth/patreon/callback"
    : "http://localhost:3001/auth/patreon/callback",
  scope: ['identity', 'identity.memberships']
}, async (accessToken, refreshToken, profile, done) => {
  // Buraya kullanıcı kayıt/güncelleme işlemleri (istersen ekleyebiliriz)
  return done(null, profile);
}));


// ⭐️ Patreon giriş başlat
app.get("/auth/patreon", passport.authenticate("patreon"));

// ⭐️ Patreon giriş sonrası callback
app.get("/auth/patreon/callback",
  passport.authenticate("patreon", {
    failureRedirect: "/login-failed",
    successRedirect: "/" // giriş başarılı olursa ana sayfaya yönlendirilir
  })
);

// ⭐️ Giriş yapan kullanıcı bilgisi
app.get("/me", (req, res) => {
  if (req.isAuthenticated()) {
    const isPatron = req.user.rawJson?.included?.[0]?.attributes?.patron_status === "active_patron";
    const email = req.user?.emails?.[0]?.value || null;
    res.json({
      isLoggedIn: true,
      isPatron,
      name: req.user.displayName,
      email
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// ⭐️ Çıkış işlemi
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// ⭐️ OpenAI bağlantısı
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

// 🚀 Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
