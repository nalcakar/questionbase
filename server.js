const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { OpenAI } = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ["http://localhost:3000", "https://questionbase-o6jk.onrender.com"],
  credentials: true
}));
app.use(express.json());

// HTML, CSS, JS dosyalarının sunumu
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/openai", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt boş olamaz." });
  }

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

app.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
