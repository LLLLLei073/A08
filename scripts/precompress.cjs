/**
 * 构建期预压缩脚本（零依赖，仅用 Node 内置 zlib）。
 *
 * 在 `vite build` 之后运行：遍历 server/public/admin 与 server/public/mobile，
 * 为每个可压缩静态资源生成 .gz（gzip level 9）与 .br（brotli quality 11）兄弟文件。
 * 服务端 precompress.middleware 会优先直发这些文件（零运行时 CPU、重启不失效）。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/precompress.cjs
 *
 * 注意：必须在 vite build 之后运行；本脚本只「新增」兄弟文件，不删除任何内容，
 * 因此可安全地重复执行（已存在的 .gz/.br 会被覆盖重写）。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOTS = [
  path.resolve(__dirname, '../packages/server/public/admin'),
  path.resolve(__dirname, '../packages/server/public/mobile'),
];

const EXT = new Set([
  '.js', '.mjs', '.cjs',
  '.css',
  '.html',
  '.json',
  '.svg',
  '.wasm',
  '.ttf', '.woff',
  '.map',
]);

const MAX_BYTES = 8 * 1024 * 1024; // 跳过超过 8MB 的文件，避免极端情况卡顿

function walk(dir, cb) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else cb(p);
  }
}

let count = 0;
let saved = 0;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) {
    console.warn(`[precompress] skip missing root: ${root}`);
    continue;
  }
  walk(root, (file) => {
    const ext = path.extname(file);
    if (!EXT.has(ext)) return;
    if (/\.(gz|br)$/.test(file)) return; // 跳过已压缩文件
    let raw;
    try {
      raw = fs.readFileSync(file);
    } catch {
      return;
    }
    if (raw.length === 0 || raw.length > MAX_BYTES) return;

    const gz = zlib.gzipSync(raw, { level: 9 });
    fs.writeFileSync(file + '.gz', gz);

    const br = zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    fs.writeFileSync(file + '.br', br);

    saved += raw.length - br.length;
    count++;
  });
}

console.log(
  `[precompress] generated .gz/.br for ${count} files ` +
    `(~${Math.round(saved / 1024)} KB saved over brotli vs raw)`,
);
