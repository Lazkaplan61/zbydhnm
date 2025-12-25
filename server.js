
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 61610;

app.set("trust proxy", true);
app.use(express.json());
app.use(express.static("public"));

const dataDir = "./data";
const catFile = path.join(dataDir, "categories.json");
const postFile = path.join(dataDir, "posts.json");
const banfile = path.join(dataDir, "bans.json");

// Gerekli dosyalar yoksa oluştur
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(catFile))
  fs.writeFileSync(catFile, JSON.stringify({ categories: [] }, null, 2));
if (!fs.existsSync(postFile))
  fs.writeFileSync(postFile, JSON.stringify({ posts: [] }, null, 2));
// Ensure bans file exists
if (!fs.existsSync(banFile))
  fs.writeFileSync(banFile, JSON.stringify({ bans: [], mutes: [] }, null, 2));

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

// IP ban middleware
app.use((req, res, next) => {
  const ip = getIP(req);
  const data = JSON.parse(fs.readFileSync(banFile));

  if (data.bans.includes(ip)) {
    return res.status(403).json({ error: "Erişimin yasaklandı." });
  }
  next();
});

// Kategorileri getir
app.get("/api/categories", (req, res) => {
  const data = JSON.parse(fs.readFileSync(catFile));
  res.json(data.categories);
});

// Kategori ekle
app.post("/api/categories", (req, res) => {
  if (!req.body.name)
    return res.status(400).json({ error: "Kategori adı zorunlu" });

  const data = JSON.parse(fs.readFileSync(catFile));
  const category = {
    id: Date.now(),
    name: req.body.name,
    createdAt: new Date().toLocaleString("tr-TR")
  };

  data.categories.push(category);
  fs.writeFileSync(catFile, JSON.stringify(data, null, 2));
  res.json(category);
});

// Kategoriye ait mesajları getir
app.get("/api/posts/:catId", (req, res) => {
  const data = JSON.parse(fs.readFileSync(postFile));
  const posts = data.posts.filter(p => String(p.catId) === String(req.params.catId));
  res.json(posts);
});

// Mesaj ekle (uyumlu: catId, title, content)
app.post("/api/posts", (req, res) => {
  const { catId, title, content } = req.body;
  if (!catId || !title || !content)
    return res.status(400).json({ error: "Eksik veri" });

  const data = JSON.parse(fs.readFileSync(postFile));
  const post = {
    id: Date.now(),
    catId,
    title,
    content,
    createdAt: new Date().toISOString()
  };

  data.posts.push(post);
  fs.writeFileSync(postFile, JSON.stringify(data, null, 2));
  res.json(post);
});

const MOD_PASSWORD = "98765432123456789";

app.post("/api/mod-login", (req, res) => {
  const ip = getIP(req);
  const { password: rawPassword, nick } = req.body || {};
  const password = String(rawPassword || '').trim();

  console.log(`[MOD-LOGIN] attempt from ${ip} nick=${nick || ''} passlen=${password.length}`);

  if (password !== MOD_PASSWORD) {
    console.log(`[MOD-LOGIN] failed for ${ip}`);
    return res.status(403).json({ error: "Şifre hatalı" });
  }

  console.log(`[MOD-LOGIN] success for ${ip} as nick=${nick || 'Yönetici'}`);
  res.json({
    ok: true,
    nick: nick && nick.trim() ? nick.trim() : "Yönetici"
  });
});

// Server başlat
app.listen(PORT, () => {
  console.log(`Zbydhnm aktif → http://localhost:${PORT}`);
});
app.delete("/api/mod/delete-category/:id", (req, res) => {
  const id = Number(req.params.id);
  const data = JSON.parse(fs.readFileSync(catFile));

  data.categories = data.categories.filter(c => c.id !== id);

  fs.writeFileSync(catFile, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});
app.delete("/api/mod/delete-category/:id", (req, res) => {
  const id = Number(req.params.id);
  const data = JSON.parse(fs.readFileSync(catFile));

  data.categories = data.categories.filter(c => c.id !== id);

  fs.writeFileSync(catFile, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});
const dmFile = "./data/dms.json";

if (!fs.existsSync(dmFile)) {
  fs.writeFileSync(dmFile, JSON.stringify({ conversations: [] }, null, 2));
}

/* MOD: TÜM DM'LERİ OKU */
app.get("/api/mod/dms", (req, res) => {
  const data = JSON.parse(fs.readFileSync(dmFile));
  // ensure every message has an id (migrate legacy entries)
  let changed = false;
  data.conversations.forEach(conv => {
    conv.messages = conv.messages || [];
    conv.messages.forEach(m => {
      if (!m.id) { m.id = Date.now() + Math.floor(Math.random()*1000); changed = true; }
    });
  });
  if (changed) fs.writeFileSync(dmFile, JSON.stringify(data, null, 2));
  res.json(data.conversations);
});

// DM helpers
function convId(a, b) {
  return [a, b].sort().join("__");
}

/* DM LİSTESİ */
app.get("/api/dm/list", (req, res) => {
  const ip = getIP(req);
  const data = JSON.parse(fs.readFileSync(dmFile));

  const list = data.conversations
    .filter(c => c.users.includes(ip))
    .map(c => ({
      id: c.id,
      with: c.users.find(u => u !== ip)
    }));

  res.json(list);
});

/* DM OKU */
app.get("/api/dm/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(dmFile));
  const conv = data.conversations.find(c => c.id === req.params.id);
  res.json(conv ? conv.messages : []);
});

/* DM GÖNDER */
app.post("/api/dm/send", (req, res) => {
  const from = getIP(req);
  const to = req.body.to;
  const text = req.body.text;
  if (!to || !text) return res.status(400).json({ error: 'Eksik veri' });

  // check mute
  const bans = JSON.parse(fs.readFileSync(banFile));
  if ((bans.mutes || []).includes(from)) {
    return res.status(403).json({ error: 'Kullanıcı susturuldu (mute)' });
  }

  const data = JSON.parse(fs.readFileSync(dmFile));
  const id = convId(from, to);

  let conv = data.conversations.find(c => c.id === id);
  if (!conv) {
    conv = { id, users: [from, to], messages: [] };
    data.conversations.push(conv);
  }

  const msg = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sender: from,
    text: text,
    time: new Date().toISOString()
  };

  conv.messages.push(msg);

  fs.writeFileSync(dmFile, JSON.stringify(data, null, 2));
  res.json({ ok: true, message: msg });
});

// MOD: pin message in DM
app.post('/api/mod/dm/pin', (req, res) => {
  const ip = getIP(req);
  const { convId, messageId } = req.body || {};
  if (!convId || !messageId) return res.status(400).json({ error: 'convId ve messageId gerekli' });
  const data = JSON.parse(fs.readFileSync(dmFile));
  const conv = data.conversations.find(c => c.id === convId);
  if (!conv) return res.status(404).json({ error: 'Konuşma bulunamadı' });
  const msg = conv.messages.find(m => String(m.id) === String(messageId));
  if (!msg) return res.status(404).json({ error: 'Mesaj bulunamadı' });
  msg.pinned = true;
  fs.writeFileSync(dmFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${ip} pinned message ${messageId} in ${convId}`);
  res.json({ ok: true });
});

// MOD: delete message from conversation
app.delete('/api/mod/dm/:convId/message/:messageId', (req, res) => {
  const ip = getIP(req);
  const convId = req.params.convId;
  const messageId = req.params.messageId;
  const data = JSON.parse(fs.readFileSync(dmFile));
  const conv = data.conversations.find(c => c.id === convId);
  if (!conv) return res.status(404).json({ error: 'Konuşma bulunamadı' });
  const before = conv.messages.length;
  conv.messages = conv.messages.filter(m => String(m.id) !== String(messageId));
  if (conv.messages.length === before) return res.status(404).json({ error: 'Mesaj bulunamadı' });
  fs.writeFileSync(dmFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${ip} deleted message ${messageId} in ${convId}`);
  res.json({ ok: true });
});

// MOD: send message as disguised alias (admin)
app.post('/api/mod/dm/send-as', (req, res) => {
  const ip = getIP(req);
  const { convId, to, text, alias } = req.body || {};
  if (!convId || !text || !alias) return res.status(400).json({ error: 'convId, text ve alias gerekli' });
  const data = JSON.parse(fs.readFileSync(dmFile));
  const conv = data.conversations.find(c => c.id === convId);
  if (!conv) return res.status(404).json({ error: 'Konuşma bulunamadı' });

  const msg = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sender: alias,
    text: text,
    time: new Date().toISOString()
  };

  conv.messages.push(msg);
  fs.writeFileSync(dmFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${ip} sent disguised message as '${alias}' to ${convId}`);
  res.json({ ok: true, message: msg });
});

// MOD: mute user by IP
app.post('/api/mod/mute', (req, res) => {
  const adminIp = getIP(req);
  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP gerekli' });
  const data = JSON.parse(fs.readFileSync(banFile));
  data.mutes = data.mutes || [];
  if (!data.mutes.includes(ip)) data.mutes.push(ip);
  fs.writeFileSync(banFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${adminIp} muted ${ip}`);
  res.json({ ok: true });
});

// MOD: unmute user
app.delete('/api/mod/mute/:ip', (req, res) => {
  const ip = req.params.ip;
  const data = JSON.parse(fs.readFileSync(banFile));
  data.mutes = (data.mutes || []).filter(x => x !== ip);
  fs.writeFileSync(banFile, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// MOD: ban listesi getir
app.get('/api/mod/bans', (req, res) => {
  const data = JSON.parse(fs.readFileSync(banFile));
  res.json(data.bans || []);
});

// MOD: ip banla
app.post('/api/mod/ban', (req, res) => {
  const adminIp = getIP(req);
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP gerekli' });

  const data = JSON.parse(fs.readFileSync(banFile));
  data.bans = data.bans || [];
  if (!data.bans.includes(ip)) data.bans.push(ip);
  fs.writeFileSync(banFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${adminIp} banned ${ip}`);
  res.json({ ok: true });
});

// MOD: ip kaldır
app.delete('/api/mod/ban/:ip', (req, res) => {
  const adminIp = getIP(req);
  const ip = req.params.ip;
  const data = JSON.parse(fs.readFileSync(banFile));
  data.bans = (data.bans || []).filter(x => x !== ip);
  fs.writeFileSync(banFile, JSON.stringify(data, null, 2));
  console.log(`[MOD] ${adminIp} unbanned ${ip}`);
  res.json({ ok: true });
});
const friendsFile = "./data/friends.json";

if (!fs.existsSync(friendsFile)) {
  fs.writeFileSync(friendsFile, JSON.stringify({
    requests: [],
    friends: [],
    blocks: []
  }, null, 2));
}

function uid(ip) {
  return "Anonim#" + ip.split(".").join("").slice(-4);
}

/* ARKADAŞ İSTEĞİ GÖNDER */
app.post("/api/friend/request", (req, res) => {
  const data = JSON.parse(fs.readFileSync(friendsFile));
  const from = getIP(req);
  const to = req.body.to;

  if (from === to) return res.json({ error: "Kendine istek atamazsın" });

  data.requests.push({ from, to, time: Date.now() });
  fs.writeFileSync(friendsFile, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

/* İSTEKLERİ GÖR */
app.get("/api/friend/requests", (req, res) => {
  const ip = getIP(req);
  const data = JSON.parse(fs.readFileSync(friendsFile));
  res.json(data.requests.filter(r => r.to === ip));
});

/* KABUL */
app.post("/api/friend/accept", (req, res) => {
  const ip = getIP(req);
  const from = req.body.from;
  const data = JSON.parse(fs.readFileSync(friendsFile));

  data.requests = data.requests.filter(r => !(r.from === from && r.to === ip));
  data.friends.push([ip, from]);

  fs.writeFileSync(friendsFile, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

/* ARKADAŞ LİSTESİ */
app.get("/api/friends", (req, res) => {
  const ip = getIP(req);
  const data = JSON.parse(fs.readFileSync(friendsFile));

  const list = data.friends
    .filter(f => f.includes(ip))
    .map(f => f[0] === ip ? f[1] : f[0]);

  res.json(list.map(i => uid(i)));
});
// ===== MOD YETKİ DOSYALARI =====
const banFile = path.join(dataDir, "bans.json");
const muteFile = path.join(dataDir, "mutes.json");
const logFile  = path.join(dataDir, "modlogs.json");

if (!fs.existsSync(banFile)) fs.writeFileSync(banFile, JSON.stringify({ bans: [] }, null, 2));
if (!fs.existsSync(muteFile)) fs.writeFileSync(muteFile, JSON.stringify({ mutes: [] }, null, 2));
if (!fs.existsSync(logFile))  fs.writeFileSync(logFile,  JSON.stringify({ logs: [] }, null, 2));

// ===== YARDIMCI: LOG =====
function modLog(action, detail, ip) {
  const data = JSON.parse(fs.readFileSync(logFile));
  data.logs.push({
    time: new Date().toISOString(),
    action,
    detail,
    ip
  });
  fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
}

// ===== MOD KONTROL =====
function isMod(req) {
  return req.headers["x-mod"] === "yes";
}

// ===== IP BAN =====
app.post("/api/mod/ban", (req, res) => {
  if (!isMod(req)) return res.sendStatus(403);

  const { ip, reason } = req.body;
  const data = JSON.parse(fs.readFileSync(banFile));

  data.bans.push({
    ip,
    reason: reason || "Belirtilmedi",
    time: new Date().toISOString()
  });

  fs.writeFileSync(banFile, JSON.stringify(data, null, 2));
  modLog("IP_BAN", reason || "-", ip);
  res.json({ ok: true });
});

// ===== MUTE =====
app.post("/api/mod/mute", (req, res) => {
  if (!isMod(req)) return res.sendStatus(403);

  const { ip, until } = req.body;
  const data = JSON.parse(fs.readFileSync(muteFile));

  data.mutes.push({
    ip,
    until, // ISO string veya "permanent"
    time: new Date().toISOString()
  });

  fs.writeFileSync(muteFile, JSON.stringify(data, null, 2));
  modLog("MUTE", until, ip);
  res.json({ ok: true });
});

// ===== İÇERİK SİL (GENEL) =====
app.post("/api/mod/delete", (req, res) => {
  if (!isMod(req)) return res.sendStatus(403);

  const { type, id } = req.body;
  let file;

  if (type === "category") file = catFile;
  if (type === "post") file = postFile;
  if (!file) return res.sendStatus(400);

  const data = JSON.parse(fs.readFileSync(file));
  const key = Object.keys(data)[0];

  data[key] = data[key].filter(x => x.id !== id);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  modLog("DELETE", `${type}:${id}`, req.ip);
  res.json({ ok: true });
});

// ===== BAN KONTROL (GLOBAL) =====
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  const data = JSON.parse(fs.readFileSync(banFile));

  if (data.bans.find(b => b.ip === ip)) {
    return res.status(403).send("Erişim engellendi");
  }
  next();
});
const watchFile = path.join(dataDir, "watchlist.json");
if (!fs.existsSync(watchFile))
  fs.writeFileSync(watchFile, JSON.stringify({ watch: [] }, null, 2));
