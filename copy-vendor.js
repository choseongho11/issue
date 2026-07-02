const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "node_modules", "pdfjs-dist", "build");
const dest = path.join(__dirname, "vendor", "pdfjs");

fs.mkdirSync(dest, { recursive: true });
for (const name of ["pdf.mjs", "pdf.mjs.map", "pdf.worker.mjs", "pdf.worker.mjs.map"]) {
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
console.log(`pdf.js 뷰어 파일을 ${dest} 로 복사했습니다.`);
