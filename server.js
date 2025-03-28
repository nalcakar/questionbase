require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const axios = require("axios");
const pool = require("./db"); // PostgreSQL bağlantısı

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// 🔐 Güvenli CORS
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://questionbase-o6jk.onrender.com"
  ],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static("public"));
app.set("trust proxy", 1); // Render için HTTPS üzerinden gelen proxy'yi güven

// 🔐 Oturum Ayarı
app.use(session({
  secret: process.env.SESSION_SECRET || "gizli",
  resave: false,
  saveUninitialized: false,
  proxy: isProd,
  cookie: {
    secure: isProd,
    sameSite: isProd ? "none" : "lax"
  }
}));

// ---------------- AUTH ----------------

app.get("/login", (req, res) => {
  res.redirect("/auth/patreon");
});

app.get("/auth/patreon", (req, res) => {
  const authUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${process.env.PATREON_CLIENT_ID}&redirect_uri=${process.env.PATREON_REDIRECT_URI}&scope=identity%20identity[email]%20identity.memberships`;
  res.redirect(authUrl);
});

app.get("/auth/patreon/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post("https://www.patreon.com/api/oauth2/token", null, {
      params: {
        code,
        grant_type: "authorization_code",
        client_id: process.env.PATREON_CLIENT_ID,
        client_secret: process.env.PATREON_CLIENT_SECRET,
        redirect_uri: process.env.PATREON_REDIRECT_URI,
      },
    });

    const access_token = tokenRes.data.access_token;

    const userRes = await axios.get("https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[user]=email,full_name", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const email = userRes.data.data.attributes.email;
    const name = userRes.data.data.attributes.full_name;
    const memberships = userRes.data.included || [];
    const isPatron = memberships.length > 0;

    req.session.user = { email, name, isPatron };

    await pool.query(
      `INSERT INTO users (email, full_name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [email, name]
    );

    res.redirect("/admin.html");
  } catch (err) {
    console.error("Patreon auth error:", err.response?.data || err);
    res.status(500).send("Patreon girişi başarısız.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

app.get("/me", (req, res) => {
  if (req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Giriş yapılmamış." });
});

// ---------------- Middleware ----------------

function authMiddleware(req, res, next) {
  if (req.session.user) next();
  else res.status(401).json({ error: "Giriş yapmalısınız." });
}

// ---------------- Veritabanı Kurulum ----------------

async function setupTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT
      );

      CREATE TABLE IF NOT EXISTS main_topics (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        user_email TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        main_topic_id INTEGER REFERENCES main_topics(id),
        content TEXT
      );

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        question_text TEXT NOT NULL,
        answer TEXT,
        category_id INTEGER REFERENCES categories(id),
        user_email TEXT,
        options JSONB,
        explanation TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tablolar kontrol edildi / oluşturuldu.");
  } catch (err) {
    console.error("❌ Tablo oluşturma hatası:", err.message);
  }
}

async function setupDefaultMainTopic() {
  try {
    const existing = await pool.query(`SELECT COUNT(*) FROM categories`);
    if (parseInt(existing.rows[0].count) === 0) {
      const check = await pool.query(`SELECT id FROM main_topics WHERE name = 'Genel'`);
      let id = check.rows[0]?.id;

      if (!id) {
        const insert = await pool.query(`INSERT INTO main_topics (name) VALUES ('Genel') RETURNING id`);
        id = insert.rows[0].id;
      }

      await pool.query(`UPDATE categories SET main_topic_id = $1 WHERE main_topic_id IS NULL`, [id]);
    }
  } catch (err) {
    console.error("Genel başlık hatası:", err.message);
  }
}

// ---------------- API Endpointler ----------------

app.get("/get-main-topics", authMiddleware, async (req, res) => {
  const email = req.session.user.email;
  const result = await pool.query(`SELECT * FROM main_topics WHERE user_email = $1 OR user_email IS NULL ORDER BY id DESC`, [email]);
  res.json(result.rows);
});

app.get("/get-categories", authMiddleware, async (req, res) => {
  const { main_topic_id } = req.query;
  const result = await pool.query(`SELECT * FROM categories WHERE main_topic_id = $1 ORDER BY id DESC`, [main_topic_id]);
  res.json(result.rows);
});

app.get("/get-questions", authMiddleware, async (req, res) => {
  const { category_id } = req.query;
  const email = req.session.user.email;
  const result = await pool.query(`
    SELECT id, question_text, answer, explanation, options FROM questions
    WHERE category_id = $1 AND user_email = $2
    ORDER BY created_at DESC
  `, [category_id, email]);
  res.json(result.rows);
});

app.post("/add-main-topic", authMiddleware, async (req, res) => {
  const { name } = req.body;
  const email = req.session.user.email;
  const result = await pool.query(`INSERT INTO main_topics (name, user_email) VALUES ($1, $2) RETURNING *`, [name, email]);
  res.json(result.rows[0]);
});

app.post("/save-question-by-category-id", authMiddleware, async (req, res) => {
  const { question_text, answer, explanation, options, content, language, category_id } = req.body;
  const email = req.session.user.email;

  try {
    const insert = await pool.query(`
      INSERT INTO questions (question_text, answer, explanation, options, content, user_email, category_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [question_text, answer, explanation, options, content, email, category_id]);

    res.json({ success: true, id: insert.rows[0].id });
  } catch (err) {
    console.error("❌ Soru ekleme hatası:", err.message);
    res.status(500).json({ success: false });
  }
});

app.post("/update-question/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { question_text, answer, explanation, options } = req.body;
  const email = req.session.user.email;

  try {
    await pool.query(`
      UPDATE questions
      SET question_text = $1,
          answer = $2,
          explanation = $3,
          options = $4
      WHERE id = $5 AND user_email = $6
    `, [question_text, answer, explanation, options, id, email]);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Güncelleme hatası:", err.message);
    res.status(500).json({ success: false });
  }
});

app.delete("/delete-question/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const email = req.session.user.email;

  try {
    await pool.query(`DELETE FROM questions WHERE id = $1 AND user_email = $2`, [id, email]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Silme hatası:", err.message);
    res.status(500).json({ success: false });
  }
});

app.get("/get-category-content", authMiddleware, async (req, res) => {
  const { category_id } = req.query;
  const result = await pool.query(`SELECT content FROM categories WHERE id = $1`, [category_id]);
  res.json(result.rows[0] || {});
});

app.post("/update-category-main-topic", authMiddleware, async (req, res) => {
  const { categoryId, newMainTopicId } = req.body;
  await pool.query(`UPDATE categories SET main_topic_id = $1 WHERE id = $2`, [newMainTopicId, categoryId]);
  res.json({ success: true });
});

app.post("/update-category-name", authMiddleware, async (req, res) => {
  const { categoryId, newName } = req.body;
  await pool.query(`UPDATE categories SET name = $1 WHERE id = $2`, [newName, categoryId]);
  res.json({ success: true });
});

app.post("/update-main-topic-name", authMiddleware, async (req, res) => {
  const { mainTopicId, newName } = req.body;
  await pool.query(`UPDATE main_topics SET name = $1 WHERE id = $2`, [newName, mainTopicId]);
  res.json({ success: true });
});
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// ---------------- Sunucu ----------------

app.listen(PORT, async () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
  await setupTables();
  await setupDefaultMainTopic();
});

