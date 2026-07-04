#!/usr/bin/env node
/*
 * Fish Tank Poker ビルド補助。
 *
 * Phase 1 では、巨大な単一HTMLを src/ から再生成できる形にする。
 * この段階では挙動を変えず、src/index.html は差し込み口を持つ骨格、
 * src/styles.css と src/app.js は現在のインライン資産をそのまま保持する。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT_HTML = path.join(ROOT, 'fish_tank_poker.html');
const SRC_INDEX = path.join(SRC, 'index.html');
const SRC_STYLE = path.join(SRC, 'styles.css');
const SRC_APP = path.join(SRC, 'app.js');
const SRC_EVALUATION_WEIGHTS = path.join(SRC, 'evaluation_weights.js');
const SRC_GTO_POSTFLOP_PROFILES = path.join(SRC, 'gto_postflop_profiles.js');
const SRC_TOURNAMENT_PROFILES = path.join(SRC, 'tournament_profiles.js');
const SRC_LIVE_CASH_PROFILES = path.join(SRC, 'live_cash_profiles.js');
const SRC_REVIEW_TEXT = path.join(SRC, 'review_text.js');

const STYLE_TOKEN = '<!-- FISH_TANK_INLINE_STYLE -->';
const SCRIPT_TOKEN = '<!-- FISH_TANK_INLINE_SCRIPT -->';
const EVALUATION_WEIGHTS_TOKEN = '  // FISH_TANK_EVALUATION_WEIGHTS_MODULE';
const GTO_POSTFLOP_PROFILES_TOKEN = '// FISH_TANK_GTO_POSTFLOP_PROFILES_MODULE';
const TOURNAMENT_PROFILES_TOKEN = '// FISH_TANK_TOURNAMENT_PROFILES_MODULE';
const LIVE_CASH_PROFILES_TOKEN = '// FISH_TANK_LIVE_CASH_PROFILES_MODULE';
const REVIEW_TEXT_TOKEN = '// FISH_TANK_REVIEW_TEXT_MODULE';

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeUtf8(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function inlineModule(app, token, file, normalizeEol = true, keepBoundaryEol = false) {
  if (!app.includes(token)) return app;
  const eol = app.includes('\r\n') ? '\r\n' : '\n';
  let moduleText = normalizeEol
    ? readUtf8(file).replace(/\r\n|\r|\n/g, eol).replace(/\s*$/u, eol)
    : readUtf8(file).replace(/\s*$/u, '');
  if (keepBoundaryEol) moduleText += eol;
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = normalizeEol || keepBoundaryEol ? escapedToken + '\\r?\\n?' : escapedToken;
  return app.replace(new RegExp(pattern), () => moduleText);
}

function splitHtml(html) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const styleMatch = html.match(/<style>\r?\n?([\s\S]*?)<\/style>/i);
  const scriptMatch = html.match(/<script>\r?\n?([\s\S]*?)<\/script>\s*<\/body>\s*<\/html>\s*$/i);
  if (!styleMatch) throw new Error('インライン <style> ブロックが見つかりません');
  if (!scriptMatch) throw new Error('末尾の <script></body></html> ブロックが見つかりません');

  const styleBlock = styleMatch[0];
  const scriptBlock = scriptMatch[0].replace(/\s*<\/body>\s*<\/html>\s*$/i, '');
  const style = styleMatch[1];
  const app = scriptBlock.replace(/^<script>\r?\n?/i, '').replace(/<\/script>$/i, '');

  const htmlShell = html
    .replace(styleBlock, () => STYLE_TOKEN)
    .replace(scriptBlock, () => SCRIPT_TOKEN)
    .replace(/\s*<\/body>\s*<\/html>\s*$/i, `${eol}</body>${eol}</html>${eol}`);

  return { htmlShell, style, app };
}

function buildHtml() {
  const shell = readUtf8(SRC_INDEX);
  const eol = shell.includes('\r\n') ? '\r\n' : '\n';
  const style = readUtf8(SRC_STYLE);
  let app = readUtf8(SRC_APP);
  app = inlineModule(app, EVALUATION_WEIGHTS_TOKEN, SRC_EVALUATION_WEIGHTS, true, true);
  app = inlineModule(app, GTO_POSTFLOP_PROFILES_TOKEN, SRC_GTO_POSTFLOP_PROFILES);
  app = inlineModule(app, TOURNAMENT_PROFILES_TOKEN, SRC_TOURNAMENT_PROFILES, false, true);
  app = inlineModule(app, LIVE_CASH_PROFILES_TOKEN, SRC_LIVE_CASH_PROFILES);
  app = inlineModule(app, REVIEW_TEXT_TOKEN, SRC_REVIEW_TEXT, false);
  if (!shell.includes(STYLE_TOKEN)) throw new Error(`src/index.html に ${STYLE_TOKEN} がありません`);
  if (!shell.includes(SCRIPT_TOKEN)) throw new Error(`src/index.html に ${SCRIPT_TOKEN} がありません`);
  const html = shell
    .replace(STYLE_TOKEN, () => `<style>${eol}${style}</style>`)
    .replace(SCRIPT_TOKEN, () => `<script>${eol}${app}</script>`);
  if (!/<\/script>\s*<\/body>\s*<\/html>\s*$/i.test(html.trim())) {
    throw new Error('再生成したHTMLの末尾タグが閉じていません');
  }
  return html;
}

function initFromCurrentHtml() {
  const html = readUtf8(OUT_HTML);
  const parts = splitHtml(html);
  writeUtf8(SRC_INDEX, parts.htmlShell);
  writeUtf8(SRC_STYLE, parts.style);
  writeUtf8(SRC_APP, parts.app);
  console.log('fish_tank_poker.html から src/ を初期化しました');
}

function writeBuild() {
  const html = buildHtml();
  writeUtf8(OUT_HTML, html);
  console.log('fish_tank_poker.html を再生成しました');
}

function checkBuild() {
  const built = buildHtml();
  const current = readUtf8(OUT_HTML);
  if (built !== current) {
    console.error('ビルド確認失敗: fish_tank_poker.html が src/ からの出力と一致しません');
    process.exit(1);
  }
  console.log('ビルド確認OK');
}

const arg = process.argv[2] || 'build';
if (arg === '--init') initFromCurrentHtml();
else if (arg === '--check') checkBuild();
else if (arg === 'build' || arg === '--build') writeBuild();
else {
  console.error('使い方: node build.js [--init|--check|--build]');
  process.exit(2);
}
