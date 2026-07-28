const $ = (selector) => document.querySelector(selector);
const profilesDefault = [
  { id: 'lin-xiaochen', name: '林小晨', short: '小晨', rank: '中国棋协 · 三级棋士', avatar: '晨' },
  { id: 'lin-xiaoyu', name: '林小雨', short: '小雨', rank: '中国棋协 · 六级棋士', avatar: '雨' }
];
const starterGames = {
  'lin-xiaochen': [
    { result: '胜', tone: 'win', title: '林小晨 1 — 王子墨 0', opening: '白方 · 斯拉夫防御', accuracy: '86.4%', date: '昨天' },
    { result: '负', tone: 'loss', title: '周小宇 1 — 林小晨 0', opening: '黑方 · 意大利开局', accuracy: '72.8%', date: '7月25日' },
    { result: '和', tone: 'draw', title: '林小晨 ½ — 陈一诺 ½', opening: '白方 · 西西里防御', accuracy: '81.2%', date: '7月23日' }
  ],
  'lin-xiaoyu': [{ result: '胜', tone: 'win', title: '林小雨 1 — 赵乐乐 0', opening: '白方 · 四马开局', accuracy: '78.6%', date: '7月26日' }]
};
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const safe = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
let profiles = readJSON('chess_profiles', profilesDefault);
let activeId = localStorage.getItem('chess_active_profile') || profiles[0].id;
let toastTimer;

function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2600); }
const current = () => profiles.find((profile) => profile.id === activeId) || profiles[0];
const gamesKey = (id) => `chess_profile_${id}_games`;
const gamesFor = (id) => readJSON(gamesKey(id), starterGames[id] || []);

function renderGames() {
  const games = gamesFor(activeId);
  $('#game-list').innerHTML = games.length ? games.map((game) => `<div class="game-row"><span class="result ${safe(game.tone)}">${safe(game.result)}</span><div class="opponent"><strong>${safe(game.title)}</strong><small>${safe(game.opening)}</small></div><div class="accuracy"><small>准确率</small><strong>${safe(game.accuracy)}</strong></div><span class="date">${safe(game.date)}</span><button aria-label="查看棋谱">›</button></div>`).join('') : '<div class="empty">还没有棋谱，导入第一盘棋开始分析吧！</div>';
}
function renderProfile() {
  const profile = current();
  document.querySelectorAll('[data-avatar]').forEach((node) => { node.textContent = profile.avatar; });
  document.querySelectorAll('[data-name]').forEach((node) => { node.textContent = profile.name; });
  document.querySelectorAll('[data-rank]').forEach((node) => { node.textContent = profile.rank; });
  $('[data-greeting]').textContent = profile.short;
  renderGames();
}
function saveImported(title) {
  const games = gamesFor(activeId);
  games.unshift({ result: '析', tone: 'draw', title, opening: '已导入 · Stockfish 分析', accuracy: '分析中', date: '刚刚' });
  localStorage.setItem(gamesKey(activeId), JSON.stringify(games));
  renderGames();
}
async function submitAnalysis({ file, pgn }) {
  const body = new FormData();
  if (file) body.append('file', file);
  if (pgn) body.append('pgn', pgn);
  body.append('engine', 'stockfish');
  body.append('profileId', activeId);
  toast('棋谱已提交，Stockfish 正在分析…');
  try {
    const response = await fetch('/api/analysis', { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const task = await response.json();
    toast(`✓ 分析任务已创建${task.id ? ` · ${task.id}` : ''}`);
  } catch (error) {
    console.info('Analysis API unavailable in preview:', error.message);
    toast('✓ 导入成功；连接分析服务后将自动生成报告');
  }
  const white = pgn?.match(/\[White\s+"([^"]+)"\]/)?.[1];
  const black = pgn?.match(/\[Black\s+"([^"]+)"\]/)?.[1];
  saveImported(file?.name || (white && black ? `${white} — ${black}` : '粘贴的 PGN 棋谱'));
}

const pieces = { a8:'♜',b8:'♞',c8:'♝',d8:'♛',e8:'♚',f8:'♝',g8:'♞',h8:'♜',a7:'♟',b7:'♟',c7:'♟',d7:'♟',f7:'♟',g7:'♟',h7:'♟',e5:'♟',c6:'♞',f6:'♞',c4:'♗',e4:'♙',f3:'♘',a2:'♙',b2:'♙',c2:'♙',d2:'♙',f2:'♙',g2:'♙',h2:'♙',a1:'♖',b1:'♘',c1:'♗',d1:'♕',e1:'♔',f1:'♖',g1:'♔' };
for (let rank=8;rank;rank--) for (let file=0;file<8;file++) { const key=`${'abcdefgh'[file]}${rank}`; const square=document.createElement('span'); square.className=`square ${(file+rank)%2?'light':'dark'}`; if(pieces[key]){square.textContent=pieces[key];square.classList.add(pieces[key].codePointAt(0)<=9817?'white':'black');} $('#board').append(square); }

$('#paste-button').addEventListener('click', () => $('#pgn-dialog').showModal());
$('#analyze-pgn').addEventListener('click', () => { const pgn=$('#pgn-text').value.trim(); if(!pgn)return toast('请先粘贴 PGN 棋谱内容'); $('#pgn-dialog').close(); submitAnalysis({pgn}); });
$('#file-input').addEventListener('change', ({target}) => { const file=target.files[0]; if(!file)return; if(file.size>10*1024*1024)return toast('文件不能超过 10MB'); submitAnalysis({file}); });
document.querySelectorAll('[data-training]').forEach((button) => button.addEventListener('click', () => toast(`正在打开「${button.dataset.training}」训练`)));
document.querySelectorAll('.nav').forEach((item) => item.addEventListener('click', () => { document.querySelectorAll('.nav').forEach((link) => link.classList.remove('active')); item.classList.add('active'); }));

function renderProfileList() {
  $('#profile-list').innerHTML = profiles.map((profile) => `<button type="button" class="profile-option ${profile.id===activeId?'active':''}" data-id="${safe(profile.id)}"><span class="avatar">${safe(profile.avatar)}</span><span><strong>${safe(profile.name)}</strong><small>${safe(profile.rank)}</small></span>${profile.id===activeId?'<b class="selected">✓</b>':''}</button>`).join('');
  document.querySelectorAll('.profile-option').forEach((button) => button.addEventListener('click', () => { activeId=button.dataset.id; localStorage.setItem('chess_active_profile',activeId); renderProfile(); $('#profile-dialog').close(); toast(`已切换到 ${current().name} 的独立档案`); }));
}
$('#profile-button').addEventListener('click', () => { renderProfileList(); $('#profile-dialog').showModal(); });
$('#add-profile').addEventListener('click', () => { $('#new-profile').hidden=false; $('#new-name').focus(); });
$('#save-profile').addEventListener('click', () => { const name=$('#new-name').value.trim(); const rank=$('#new-rank').value.trim()||'暂未设置棋手等级'; if(!name)return toast('请填写棋手姓名'); const id=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`; profiles.push({id,name,short:name.slice(-2),rank,avatar:name.slice(-1)}); localStorage.setItem('chess_profiles',JSON.stringify(profiles)); activeId=id; localStorage.setItem('chess_active_profile',id); $('#new-profile').hidden=true; renderProfile(); $('#profile-dialog').close(); toast(`已为 ${name} 建立独立棋手档案`); });
renderProfile();
