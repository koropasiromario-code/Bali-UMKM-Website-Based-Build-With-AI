require("dotenv").config();
const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET wajib diisi dengan secret acak minimal 32 karakter. Lihat .env.example");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "bali-umkm.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS businesses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 district TEXT NOT NULL,
 description TEXT DEFAULT '',
 phone TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS price_calculations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_name TEXT NOT NULL,
 material_cost REAL NOT NULL,
 operating_cost REAL NOT NULL,
 margin_percent REAL NOT NULL,
 selling_price REAL NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.disable("x-powered-by");

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};

function auth(req, res, next) {
  const token = req.cookies.bali_umkm_session;
  if (!token) return res.status(401).json({ error: "Silakan masuk terlebih dahulu." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, name: payload.name, email: payload.email };
    next();
  } catch {
    res.clearCookie("bali_umkm_session", cookieOptions);
    return res.status(401).json({ error: "Sesi berakhir. Silakan masuk kembali." });
  }
}
function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 180;
}
function issueSession(user, res) {
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("bali_umkm_session", token, cookieOptions);
}
function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

app.post("/api/auth/register", async (req, res) => {
  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 180).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || !validEmail(email) || password.length < 8) {
    return res.status(400).json({ error: "Nama minimal 2 karakter, email harus valid, dan kata sandi minimal 8 karakter." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)").run(name, email, hash);
    const user = { id: Number(result.lastInsertRowid), name, email };
    issueSession(user, res);
    res.status(201).json({ user });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Email sudah terdaftar." });
    console.error(e); res.status(500).json({ error: "Gagal membuat akun." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = cleanText(req.body.email, 180).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const row = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: "Email atau kata sandi tidak cocok." });
  }
  const user = publicUser(row);
  issueSession(user, res);
  res.json({ user });
});
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("bali_umkm_session", cookieOptions);
  res.json({ ok: true });
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: req.user }));

app.get("/api/dashboard", auth, (req, res) => {
  const businessCount = db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE user_id=?").get(req.user.id).n;
  const calculations = db.prepare("SELECT COUNT(*) AS n FROM price_calculations WHERE user_id=?").get(req.user.id).n;
  const latest = db.prepare("SELECT product_name, selling_price, created_at FROM price_calculations WHERE user_id=? ORDER BY id DESC LIMIT 5").all(req.user.id);
  res.json({ businessCount, calculations, latest });
});

app.get("/api/businesses", auth, (req, res) => {
  const rows = db.prepare("SELECT id,name,category,district,description,phone,created_at FROM businesses WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json({ businesses: rows });
});
app.post("/api/businesses", auth, (req, res) => {
  const name = cleanText(req.body.name, 120);
  const category = cleanText(req.body.category, 60);
  const district = cleanText(req.body.district, 60);
  const description = cleanText(req.body.description, 500);
  const phone = cleanText(req.body.phone, 30);
  if (name.length < 2 || !category || !district) return res.status(400).json({ error: "Nama, kategori, dan kabupaten/kota wajib diisi." });
  const result = db.prepare("INSERT INTO businesses (user_id,name,category,district,description,phone) VALUES (?,?,?,?,?,?)")
    .run(req.user.id, name, category, district, description, phone);
  res.status(201).json({ business: db.prepare("SELECT id,name,category,district,description,phone,created_at FROM businesses WHERE id=?").get(result.lastInsertRowid) });
});
app.delete("/api/businesses/:id", auth, (req, res) => {
  const result = db.prepare("DELETE FROM businesses WHERE id=? AND user_id=?").run(Number(req.params.id), req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Data usaha tidak ditemukan." });
  res.json({ ok: true });
});

app.post("/api/pricing", auth, (req, res) => {
  const productName = cleanText(req.body.productName, 120);
  const materialCost = Number(req.body.materialCost);
  const operatingCost = Number(req.body.operatingCost);
  const marginPercent = Number(req.body.marginPercent);
  if (!productName || !Number.isFinite(materialCost) || !Number.isFinite(operatingCost) ||
      !Number.isFinite(marginPercent) || materialCost < 0 || operatingCost < 0 ||
      materialCost + operatingCost <= 0 || marginPercent < 0 || marginPercent > 500) {
    return res.status(400).json({ error: "Periksa nama produk, biaya, dan margin (0–500%)." });
  }
  const totalCost = materialCost + operatingCost;
  const sellingPrice = Math.ceil(totalCost * (1 + marginPercent / 100) / 500) * 500;
  const profit = sellingPrice - totalCost;
  const result = db.prepare(`INSERT INTO price_calculations
    (user_id,product_name,material_cost,operating_cost,margin_percent,selling_price)
    VALUES (?,?,?,?,?,?)`).run(req.user.id, productName, materialCost, operatingCost, marginPercent, sellingPrice);
  res.status(201).json({ id: Number(result.lastInsertRowid), productName, totalCost, marginPercent, sellingPrice, profit });
});
app.get("/api/pricing", auth, (req, res) => {
  const rows = db.prepare("SELECT id,product_name,material_cost,operating_cost,margin_percent,selling_price,created_at FROM price_calculations WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.id);
  res.json({ calculations: rows });
});

const prompts = {
  marketing: "Buat caption media sosial dan strategi promosi yang praktis untuk UMKM. Sertakan CTA dan hashtag relevan.",
  produk: "Buat deskripsi produk yang menarik, jujur, jelas, dan siap dipakai di katalog online. Jangan mengarang klaim atau sertifikasi.",
  konsultasi: "Bertindak sebagai mentor UMKM. Analisis tantangan dan berikan langkah prioritas yang realistis, berbiaya rendah, dan terukur.",
  ide: "Berikan 5 ide pengembangan UMKM yang relevan dengan ekosistem Bali. Sertakan target pelanggan, cara validasi, dan langkah pertama."
};
app.post("/api/ai/generate", auth, async (req, res) => {
  const type = cleanText(req.body.type, 30);
  const businessName = cleanText(req.body.businessName, 120);
  const category = cleanText(req.body.category, 80);
  const details = cleanText(req.body.details, 1800);
  if (!prompts[type] || details.length < 5) return res.status(400).json({ error: "Pilih jenis bantuan dan isi detail minimal 5 karakter." });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI belum dikonfigurasi. Admin perlu mengisi OPENAI_API_KEY pada file .env. Fitur akun, direktori, dan kalkulator tetap dapat digunakan." });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: "Anda adalah konsultan digital UMKM Indonesia yang memahami konteks Bali. Jawab dalam Bahasa Indonesia yang jelas, praktis, tidak berlebihan, dan sesuai skala usaha kecil. Jangan mengarang data pasar, harga, peraturan, atau fakta. Jika informasi kurang, sebutkan asumsi.",
        input: `${prompts[type]}\nNama usaha: ${businessName || "Belum disebutkan"}\nKategori: ${category || "Belum disebutkan"}\nKonteks pengguna: ${details}`,
        max_output_tokens: 900
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("AI provider error:", data.error?.message || response.status);
      return res.status(502).json({ error: "Layanan AI sedang bermasalah. Coba lagi beberapa saat." });
    }
    const text = (data.output || []).flatMap(item => item.content || [])
      .filter(item => item.type === "output_text").map(item => item.text).join("\n").trim();
    if (!text) return res.status(502).json({ error: "AI tidak mengembalikan teks. Silakan coba lagi." });
    res.json({ result: text });
  } catch (e) {
    console.error(e); res.status(502).json({ error: "Tidak dapat menghubungi layanan AI." });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`BALI UMKM AI berjalan di http://localhost:${PORT}`));
