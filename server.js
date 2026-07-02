const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 5173;
const ROOT_DIR = __dirname;
const BOOK_DIR = path.join(ROOT_DIR, "books");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");
const TOC_PATH = path.join(ROOT_DIR, "toc.json");

fs.mkdirSync(BOOK_DIR, { recursive: true });

function fixFilenameEncoding(name) {
  // busboy는 멀티파트 파일명 헤더를 기본적으로 latin1로 디코딩하므로,
  // UTF-8로 보낸 한글 등 비ASCII 파일명은 여기서 다시 UTF-8로 복원해야 한다.
  return Buffer.from(name, "latin1").toString("utf8");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BOOK_DIR),
  filename: (_req, file, cb) => {
    const originalName = fixFilenameEncoding(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const base = path
      .basename(originalName, ext)
      .replace(/[^\p{L}\p{N}._ -]+/gu, "")
      .trim()
      .replace(/\s+/g, "_");
    cb(null, `${base || "ebook"}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || path.extname(fixFilenameEncoding(file.originalname)).toLowerCase() === ".pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("PDF 파일만 업로드할 수 있습니다."));
  }
});

function loadTocMap() {
  try {
    return JSON.parse(fs.readFileSync(TOC_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveTocMap(tocMap) {
  fs.writeFileSync(TOC_PATH, JSON.stringify(tocMap, null, 2));
}

function parseIssueKey(fileName) {
  // "정책이슈26-5호-<timestamp>.pdf" -> 26년 5호. 연도+호수로 최신순 정렬하기 위한 키를 뽑는다.
  const base = path.basename(fileName, ".pdf").replace(/[-_]\d{10,}$/, "");
  const match = base.match(/(\d{2,4})\s*[-_]\s*(\d{1,3})\s*호/);
  if (!match) return null;
  let year = Number(match[1]);
  if (year < 100) year += 2000;
  const issue = Number(match[2]);
  return year * 1000 + issue;
}

function getBooks() {
  const tocMap = loadTocMap();
  return fs
    .readdirSync(BOOK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => {
      const filePath = path.join(BOOK_DIR, entry.name);
      const stat = fs.statSync(filePath);
      return {
        id: encodeURIComponent(entry.name),
        title: path.basename(entry.name, ".pdf").replace(/[-_]\d{10,}$/, "").replace(/[_-]+/g, " "),
        fileName: entry.name,
        url: `books/${encodeURIComponent(entry.name)}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        toc: [...(tocMap[entry.name] || [])].sort((a, b) => a.page - b.page)
      };
    })
    .sort((a, b) => {
      const keyA = parseIssueKey(a.fileName);
      const keyB = parseIssueKey(b.fileName);
      if (keyA !== null && keyB !== null) return keyB - keyA;
      if (keyA !== null) return -1;
      if (keyB !== null) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
}

function syncManifest() {
  const books = getBooks();
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), books }, null, 2)
  );
  return books;
}

app.use(express.static(ROOT_DIR));
app.use(express.json());

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/books", (_req, res) => {
  res.json({ books: getBooks() });
});

app.post("/api/books", upload.single("book"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "업로드할 PDF 파일이 없습니다." });
    return;
  }
  const books = syncManifest();
  res.status(201).json({ book: books.find((book) => book.fileName === req.file.filename) });
});

app.delete("/api/books/:fileName", (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    res.status(400).json({ error: "잘못된 파일명입니다." });
    return;
  }
  const filePath = path.join(BOOK_DIR, fileName);
  if (!filePath.startsWith(BOOK_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    return;
  }
  fs.unlinkSync(filePath);
  const tocMap = loadTocMap();
  delete tocMap[fileName];
  saveTocMap(tocMap);
  syncManifest();
  res.json({ ok: true });
});

app.put("/api/books/:fileName/toc", (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);
  const filePath = path.join(BOOK_DIR, fileName);
  if (!filePath.startsWith(BOOK_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    return;
  }
  const rawToc = Array.isArray(req.body?.toc) ? req.body.toc : [];
  const toc = rawToc
    .map((item) => ({
      title: String(item?.title ?? "").trim(),
      page: Math.max(1, Math.floor(Number(item?.page)) || 1)
    }))
    .filter((item) => item.title)
    .sort((a, b) => a.page - b.page);

  const tocMap = loadTocMap();
  if (toc.length) {
    tocMap[fileName] = toc;
  } else {
    delete tocMap[fileName];
  }
  saveTocMap(tocMap);
  const books = syncManifest();
  res.json({ book: books.find((book) => book.fileName === fileName) });
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "요청을 처리하지 못했습니다." });
});

syncManifest();

app.listen(PORT, () => {
  console.log(`온라인 예산정책이슈 로컬 관리 도구: http://localhost:${PORT}`);
});
