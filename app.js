/* ═══════════════════════════════════════════════════════════════
   Shadow Chess — Client Application  v2
   ═══════════════════════════════════════════════════════════════ */
var Engine = window.ShadowChessEngine;

var SYMBOLS = {
  white: { K:'\u2654', Q:'\u2655', R:'\u2656', B:'\u2657', N:'\u2658', P:'\u2659' },
  black: { K:'\u265A', Q:'\u265B', R:'\u265C', B:'\u265D', N:'\u265E', P:'\u265F' },
};
var PIECE_ORDER = ['K','Q','R','B','N','P'];
var EMPTY_TOOL  = '__empty__';
var REQUIRED    = { K:1, Q:1, R:2, B:2, N:2, P:8 };
var FILES       = 'abcdefgh';
var PIECE_VAL   = { P:1, N:3, B:3, R:5, Q:9, K:0 };

/* ── State ────────────────────────────────────────────────── */
var App = {
  locale: localStorage.getItem('shadow-lang') || 'tr',
  activeScreen: 'menu-screen',
  mode: null,            // 'cpu' | 'online'
  busy: false,
  selected: null,
  legalMoves: [],
  pollTimer: null,
  cpuTimer: null,
  localGame: null,
  localPlayerColor: 'white',
  moveLog: [],           // [{piece,from,to,captured,color}, ...]
  chosenColor: localStorage.getItem('shadow-color') || 'white',
  theme: localStorage.getItem('shadow-theme') || 'classic',
  tutorial: { active:false, step:0 },
  guide: {
    enabled: localStorage.getItem('shadow-guide-off') !== '1',
    step: Number(localStorage.getItem('shadow-guide-step') || 0),
  },
  cpu: { enemySetup:null },
  online: { roomId:null, token:null, color:null, state:null, chatLen:0 },
  setup: { draft:null, ready:false, playerColor:'white', roomUrl:'', heldPiece:null },
};

var dom = {};

/* ═══════════════════════════════════════════════════════════════
   1.  HELPERS
   ═══════════════════════════════════════════════════════════════ */
function $(id){ return document.getElementById(id); }

function cacheDom(){
  var ids = [
    'menu-screen','setup-screen','tutorial-screen','game-screen',
    'lang-tr-btn','lang-en-btn',
    'menu-kicker','menu-title','menu-copy','create-room-btn','cpu-mode-btn','open-tutorial-btn',
    'room-code-input','join-room-btn','join-label',
    'feature-setup-title','feature-setup-copy','feature-shadow-title','feature-shadow-copy',
    'feature-fog-title','feature-fog-copy','menu-wraith-copy','menu-status',
    'color-label','pick-white','pick-random','pick-black',
    'pick-white-label','pick-random-label','pick-black-label',
    'theme-label','theme-picker',
    'setup-kicker','setup-title','setup-subtitle','setup-back-btn',
    'setup-board','setup-status','palette-title','palette-copy',
    'setup-eraser-btn','setup-palette','setup-held-piece',
    'share-box','share-link-input','share-label','copy-link-btn',
    'setup-clear-btn','setup-default-btn','setup-ready-btn',
    'tutorial-board','tut-panel','tut-speech','tut-step-ind','tut-skip-btn','tut-next-btn',
    'enemy-name','enemy-captured','game-board',
    'self-name','self-captured',
    'turn-badge','game-message',
    'hide-btn','extra-action-btn','rematch-btn',
    'game-wraith-copy',
    'tab-moves-btn','tab-chat-btn','moves-panel','chat-panel',
    'move-log','chat-messages','chat-input','chat-send-btn',
    'guide-panel','guide-title','guide-text','guide-skip-btn','guide-next-btn',
    'result-modal','result-kicker','result-title','result-text','result-primary','result-secondary',
    'toast',
  ];
  ids.forEach(function(id){ dom[id] = $(id); });
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(function(el){ el.classList.remove('active'); });
  var s = $(id); if(s) s.classList.add('active');
  App.activeScreen = id;
}

var toastT = null;
function showToast(msg, warn){
  var el = dom['toast'];
  el.textContent = msg;
  el.className = 'toast show' + (warn ? ' warn' : '');
  clearTimeout(toastT);
  toastT = setTimeout(function(){ el.className = 'toast'; }, 2600);
}

/* ═══════════════════════════════════════════════════════════════
   2.  I18N
   ═══════════════════════════════════════════════════════════════ */
function t(key){
  var d = window.I18N_DATA || {};
  var m = d[App.locale] || d.tr || {};
  return m[key] !== undefined ? m[key] : key;
}
function td(key){
  var d = window.I18N_DATA || {};
  var m = (d.dynamic||{})[App.locale] || (d.dynamic||{}).tr || {};
  return m[key] !== undefined ? m[key] : key;
}
function applyTexts(){
  var d = window.I18N_DATA || {};
  var m = d[App.locale] || d.tr || {};
  Object.keys(m).forEach(function(id){ var el=$(id); if(el) el.textContent=m[id]; });
  dom['lang-tr-btn'].classList.toggle('active', App.locale==='tr');
  dom['lang-en-btn'].classList.toggle('active', App.locale==='en');
}
function setLang(lang){
  App.locale = lang;
  localStorage.setItem('shadow-lang', lang);
  applyTexts();
  if(App.activeScreen==='setup-screen'){ renderPalette(); updateSetupHeld(); updateSetupStatus(); }
  if(App.activeScreen==='game-screen'){ updateGameUI(); renderMoveLog(); }
  if(App.activeScreen==='tutorial-screen'){ renderTutStep(); }
  updateGuide();
}

/* ═══════════════════════════════════════════════════════════════
   3.  THEME & COLOR SELECTION
   ═══════════════════════════════════════════════════════════════ */
function applyTheme(name){
  App.theme = name;
  localStorage.setItem('shadow-theme', name);
  document.body.setAttribute('data-theme', name);
  document.querySelectorAll('.theme-opt').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-theme')===name);
  });
}
function applyColorChoice(c){
  App.chosenColor = c;
  localStorage.setItem('shadow-color', c);
  document.querySelectorAll('.color-opt').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-color')===c);
  });
}
function resolveColor(){
  if(App.chosenColor==='random') return Math.random()<.5 ? 'white' : 'black';
  return App.chosenColor;
}

/* ═══════════════════════════════════════════════════════════════
   4.  BOARD HELPERS
   ═══════════════════════════════════════════════════════════════ */
function flipRow(r,c){ return c==='black' ? 7-r : r; }
function flipCol(c2,c){ return c==='black' ? 7-c2 : c2; }
function sqColor(r,c){ return (r+c)%2===0 ? 'light' : 'dark'; }
function toAlg(row,col){ return FILES[col] + (8-row); }
function moveNotation(m){
  if(!m) return '';
  if(m.piece==='P'){
    if(m.captured) return FILES[m.from[1]]+'x'+toAlg(m.to[0],m.to[1]);
    return toAlg(m.to[0],m.to[1]);
  }
  return m.piece + (m.captured?'x':'') + toAlg(m.to[0],m.to[1]);
}

/* ═══════════════════════════════════════════════════════════════
   5.  SETUP SCREEN
   ═══════════════════════════════════════════════════════════════ */
function initSetup(color, mode, existingDraft){
  App.setup.playerColor = color;
  App.setup.draft = existingDraft || Engine.createDefaultSetup(color);
  App.setup.ready = false;
  App.setup.heldPiece = null;
  App.mode = mode;
  showScreen('setup-screen');
  if(mode==='online'){ dom['share-box'].classList.remove('hidden'); dom['share-link-input'].value=App.setup.roomUrl; }
  else { dom['share-box'].classList.add('hidden'); }
  dom['setup-ready-btn'].disabled = false;
  renderSetupBoard(); renderPalette(); updateSetupHeld(); updateSetupStatus(); updateGuide();
}

function getPlacedCounts(){
  var c={}; var d=App.setup.draft; var color=App.setup.playerColor;
  Engine.HOME_ROWS[color].forEach(function(row){
    for(var col=0;col<8;col++){ var t=d[row][col]; if(t) c[t]=(c[t]||0)+1; }
  }); return c;
}
function getRemainingCount(type){ var p=getPlacedCounts(); return (REQUIRED[type]||0)-(p[type]||0); }
function totalPlaced(){ var c=getPlacedCounts(),n=0; Object.keys(c).forEach(function(k){n+=c[k];}); return n; }
function isSetupComplete(){ return totalPlaced()===16; }

function renderSetupBoard(){
  var board=dom['setup-board']; board.innerHTML='';
  var color=App.setup.playerColor, homeRows=Engine.HOME_ROWS[color];
  for(var dr=0;dr<8;dr++) for(var dc=0;dc<8;dc++){
    var row=flipRow(dr,color), col=flipCol(dc,color);
    var sq=document.createElement('button');
    sq.className='square '+sqColor(row,col);
    if(homeRows.indexOf(row)!==-1) sq.classList.add('setup-own');
    var type=App.setup.draft[row][col];
    if(type){ var sp=document.createElement('span'); sp.className='piece '+color; sp.textContent=SYMBOLS[color][type]; sq.appendChild(sp); }
    if(dc===0){ var cr=document.createElement('span'); cr.className='coord coord-rank'; cr.textContent=8-row; sq.appendChild(cr); }
    if(dr===7){ var cf=document.createElement('span'); cf.className='coord coord-file'; cf.textContent=FILES[col]; sq.appendChild(cf); }
    (function(r,c){ sq.addEventListener('click',function(){ onSetupClick(r,c); }); })(row,col);
    board.appendChild(sq);
  }
}

function renderPalette(){
  var pal=dom['setup-palette']; pal.innerHTML='';
  var color=App.setup.playerColor, names=td('pieceNames')||{};
  PIECE_ORDER.forEach(function(type){
    var rem=getRemainingCount(type);
    var btn=document.createElement('button'); btn.className='palette-piece';
    if(App.setup.heldPiece===type) btn.classList.add('active');
    if(rem===0) btn.classList.add('empty');
    var sym=document.createElement('span'); sym.className='piece '+color; sym.textContent=SYMBOLS[color][type]; sym.style.pointerEvents='none';
    var lbl=document.createElement('span'); lbl.className='palette-count'; lbl.textContent=(names[type]||type)+' ('+rem+')';
    btn.appendChild(sym); btn.appendChild(lbl);
    (function(t){ btn.addEventListener('click',function(){ selectPalette(t); }); })(type);
    pal.appendChild(btn);
  });
  dom['setup-eraser-btn'].classList.toggle('btn-secondary', App.setup.heldPiece===EMPTY_TOOL);
}

function selectPalette(type){ App.setup.heldPiece = App.setup.heldPiece===type ? null : type; renderPalette(); updateSetupHeld(); }
function updateSetupHeld(){
  var el=dom['setup-held-piece'];
  if(App.setup.heldPiece===EMPTY_TOOL){ el.textContent=td('eraserOn'); }
  else if(App.setup.heldPiece){ var n=td('pieceNames')||{}; el.textContent=td('held')+': '+SYMBOLS[App.setup.playerColor][App.setup.heldPiece]+' '+(n[App.setup.heldPiece]||App.setup.heldPiece); }
  else { el.textContent=td('noHeld'); }
}

function onSetupClick(row,col){
  var color=App.setup.playerColor;
  if(App.setup.ready) return;
  if(Engine.HOME_ROWS[color].indexOf(row)===-1) return;
  if(App.setup.heldPiece===EMPTY_TOOL){ App.setup.draft[row][col]=null; refreshSetup(); return; }
  if(!App.setup.heldPiece){ var ex=App.setup.draft[row][col]; if(ex){ App.setup.draft[row][col]=null; App.setup.heldPiece=ex; refreshSetup(); } return; }
  var type=App.setup.heldPiece, rem=getRemainingCount(type);
  if(rem<=0){ var pr=App.setup.draft[row][col]; if(pr){ App.setup.draft[row][col]=null; rem=getRemainingCount(type); } if(rem<=0) return; }
  App.setup.draft[row][col]=type;
  if(getRemainingCount(type)<=0) App.setup.heldPiece=null;
  refreshSetup();
}
function refreshSetup(){ renderSetupBoard(); renderPalette(); updateSetupHeld(); updateSetupStatus(); }
function clearDraft(){ App.setup.draft=Engine.emptyBoard(); App.setup.heldPiece=null; refreshSetup(); }
function applyDefault(){ App.setup.draft=Engine.createDefaultSetup(App.setup.playerColor); App.setup.heldPiece=null; refreshSetup(); }

function updateSetupStatus(){
  var el=dom['setup-status'], rem=16-totalPlaced();
  if(App.setup.ready) el.textContent=td('readyWaiting');
  else if(rem>0) el.textContent=td('setupIncomplete').replace('{n}',rem);
  else el.textContent=td('setupReady');
  if(App.mode==='online' && App.online.state){
    var pl=App.online.state.players, opp=Engine.opposite(App.online.color);
    if(!pl[opp].joined) el.textContent+='\n'+td('waitingOpponent');
    else if(!pl[opp].ready) el.textContent+='\n'+td('waitingReady');
  }
  dom['setup-ready-btn'].disabled=!isSetupComplete()||App.setup.ready;
}

function onSetupReady(){
  if(!isSetupComplete()) return;
  var v=Engine.validateSetup(App.setup.draft,App.setup.playerColor);
  if(!v.ok){ showToast(v.error,true); return; }
  if(App.mode==='cpu') startCpuGame();
  else if(App.mode==='online') submitOnlineSetup();
}

/* ═══════════════════════════════════════════════════════════════
   6.  ONLINE MODE
   ═══════════════════════════════════════════════════════════════ */
function api(method,path,body){
  var o={method:method,headers:{}};
  if(body){ o.headers['Content-Type']='application/json'; o.body=JSON.stringify(body); }
  return fetch(path,o).then(function(r){ return r.json(); });
}

function createRoom(){
  if(App.busy) return; App.busy=true; dom['menu-status'].textContent='\u2026';
  api('POST','/api/rooms').then(function(d){
    App.online.roomId=d.roomId; App.online.token=d.token; App.online.color=d.color; App.online.state=d.state; App.setup.roomUrl=d.shareUrl;
    showToast(td('roomCreated')); initSetup(d.color,'online'); startPolling();
  }).catch(function(e){ showToast(e.message||'Error',true); }).finally(function(){ App.busy=false; dom['menu-status'].textContent=''; });
}

function joinRoom(code){
  if(!code||App.busy) return; App.busy=true; dom['menu-status'].textContent='\u2026';
  api('POST','/api/rooms/'+code.toUpperCase()+'/join').then(function(d){
    if(d.error){ showToast(d.error,true); return; }
    App.online.roomId=d.roomId; App.online.token=d.token; App.online.color=d.color; App.online.state=d.state; App.setup.roomUrl=d.state.roomUrl||'';
    initSetup(d.color,'online'); startPolling();
  }).catch(function(e){ showToast(e.message||'Error',true); }).finally(function(){ App.busy=false; dom['menu-status'].textContent=''; });
}

function submitOnlineSetup(){
  api('POST','/api/rooms/'+App.online.roomId+'/setup',{ token:App.online.token, setup:App.setup.draft, ready:true }).then(function(d){
    if(d.error){ showToast(d.error,true); return; }
    App.online.state=d; App.setup.ready=true; updateSetupStatus(); syncOnline(d);
  }).catch(function(e){ showToast(e.message||'Error',true); });
}

function startPolling(){
  stopPolling();
  App.pollTimer = setInterval(function(){
    api('GET','/api/rooms/'+App.online.roomId+'/state?token='+App.online.token).then(function(s){
      if(!s.error) syncOnline(s);
    }).catch(function(){});
  }, 2000);
}
function stopPolling(){ if(App.pollTimer){ clearInterval(App.pollTimer); App.pollTimer=null; } }

function syncOnline(state){
  var prev = App.online.state && App.online.state.game ? App.online.state.game.version : -1;
  App.online.state = state;
  // sync move log
  if(state.moveLog) App.moveLog = state.moveLog;
  // sync chat
  if(state.chat && state.chat.length > App.online.chatLen){
    App.online.chatLen = state.chat.length;
    renderChat(state.chat);
  }
  if(state.phase==='playing'){
    var nv = state.game ? state.game.version : -1;
    if(App.activeScreen!=='game-screen'){ showScreen('game-screen'); updateGuide(); }
    if(nv!==prev){ clearSel(); renderGameBoard(); updateGameUI(); renderMoveLog(); if(state.game.over) setTimeout(showResult,500); }
    return;
  }
  if(App.activeScreen==='setup-screen') updateSetupStatus();
}

/* ═══════════════════════════════════════════════════════════════
   7.  CPU MODE
   ═══════════════════════════════════════════════════════════════ */
function startCpuMode(){
  App.mode='cpu';
  App.localPlayerColor = resolveColor();
  initSetup(App.localPlayerColor,'cpu');
}

function startCpuGame(){
  var color=App.localPlayerColor, cpuColor=Engine.opposite(color);
  App.cpu.enemySetup = Engine.createRandomSetup(cpuColor);
  App.moveLog = [];
  try {
    App.localGame = color==='white'
      ? Engine.createGame(App.setup.draft, App.cpu.enemySetup)
      : Engine.createGame(App.cpu.enemySetup, App.setup.draft);
  } catch(e){ showToast(e.message,true); return; }
  showScreen('game-screen'); renderGameBoard(); updateGameUI(); renderMoveLog(); updateGuide();
  if(App.localGame.turn!==color) scheduleCpu();
}

function scheduleCpu(){
  clearTimeout(App.cpuTimer);
  App.cpuTimer = setTimeout(function(){
    if(!App.localGame||App.localGame.over) return;
    var cpuC=Engine.opposite(App.localPlayerColor);
    var act=Engine.chooseCpuAction(App.localGame,cpuC);
    if(act.useHide){ var h=Engine.hideAllPieces(App.localGame,cpuC); if(h.ok) App.localGame=h.game; }
    if(act.move){
      var r=Engine.makeMove(App.localGame,cpuC,act.move.from,act.move.to);
      if(r.ok){
        App.localGame=r.game;
        App.moveLog.push({ piece:act.move.piece||'?', from:act.move.from, to:act.move.to, captured:r.game.lastMove?r.game.lastMove.captured:null, color:cpuC });
      }
    }
    renderGameBoard(); updateGameUI(); renderMoveLog();
    if(App.localGame.over) setTimeout(showResult,500);
  }, 700);
}

/* ═══════════════════════════════════════════════════════════════
   8.  GAME RENDERING
   ═══════════════════════════════════════════════════════════════ */
function getView(){
  if(App.mode==='cpu'&&App.localGame) return Engine.serializeGameForPlayer(App.localGame,App.localPlayerColor);
  if(App.mode==='online'&&App.online.state&&App.online.state.game) return App.online.state.game;
  return null;
}
function myColor(){ return App.mode==='online' ? App.online.color : App.localPlayerColor; }

function renderGameBoard(){
  var bEl=dom['game-board']; bEl.innerHTML='';
  var view=getView(); if(!view) return;
  var color=myColor();
  for(var dr=0;dr<8;dr++) for(var dc=0;dc<8;dc++){
    var row=flipRow(dr,color), col=flipCol(dc,color);
    var sq=document.createElement('button'); sq.className='square '+sqColor(row,col);
    if(view.lastMove){
      if(row===view.lastMove.from[0]&&col===view.lastMove.from[1]) sq.classList.add('last-from');
      if(row===view.lastMove.to[0]&&col===view.lastMove.to[1]) sq.classList.add('last-to');
    }
    if(App.selected&&App.selected[0]===row&&App.selected[1]===col) sq.classList.add('selected');
    var isTarget=App.legalMoves.some(function(m){ return m[0]===row&&m[1]===col; });
    if(isTarget) sq.classList.add(view.board[row][col]?'capture-target':'move-target');
    var cell=view.board[row][col];
    if(cell){
      var sp=document.createElement('span');
      if(cell.hidden){ sp.className='piece mystery'; sp.textContent='?'; }
      else { sp.className='piece '+cell.color; sp.textContent=SYMBOLS[cell.color][cell.type]; }
      sq.appendChild(sp);
    }
    if(dc===0){ var cr=document.createElement('span'); cr.className='coord coord-rank'; cr.textContent=8-row; sq.appendChild(cr); }
    if(dr===7){ var cf=document.createElement('span'); cf.className='coord coord-file'; cf.textContent=FILES[col]; sq.appendChild(cf); }
    (function(r,c){ sq.addEventListener('click',function(){ onGameClick(r,c); }); })(row,col);
    bEl.appendChild(sq);
  }
}

function updateGameUI(){
  var view=getView(); if(!view) return;
  var color=myColor(), isMyTurn=view.turn===color;
  dom['turn-badge'].textContent = App.mode==='cpu'
    ? (isMyTurn?td('turnYou'):td('turnCpu'))
    : (isMyTurn?td('turnYou'):td('turnOpponent'));
  dom['self-name'].textContent=td('youName')||t('self-name');
  dom['enemy-name'].textContent=App.mode==='cpu'?td('cpuName'):t('enemy-name');
  var msg='';
  if(view.over){
    if(view.result==='checkmate') msg=td('checkmate');
    else if(view.result==='king-capture') msg=td('kingCapture');
    else if(view.result==='stalemate') msg=td('stalemate');
  } else if(view.check&&view.check.self) msg=td('check');
  dom['game-message'].textContent=msg;
  dom['hide-btn'].disabled=!isMyTurn||view.over||!view.hideAvailable.self;
  dom['rematch-btn'].classList.toggle('hidden',!view.over);
  // chat tab visibility (only online)
  dom['tab-chat-btn'].style.display = App.mode==='online' ? '' : 'none';
  // captured
  renderCaptured(view.capturedBy, color);
  // wraith
  if(view.over) dom['game-wraith-copy'].textContent=view.winner===color?td('youWin'):(view.winner?td('youLose'):td('draw'));
  else dom['game-wraith-copy'].textContent=t('game-wraith-copy');
}

function renderCaptured(capturedBy, playerColor){
  var opp=Engine.opposite(playerColor);
  renderCapStrip(dom['self-captured'], capturedBy[playerColor], opp);
  renderCapStrip(dom['enemy-captured'], capturedBy[opp], playerColor);
}
function renderCapStrip(el, arr, pieceColor){
  el.innerHTML='';
  if(!arr||!arr.length) return;
  var total=0;
  arr.forEach(function(t){
    var sp=document.createElement('span'); sp.className='cap-piece'; sp.textContent=SYMBOLS[pieceColor][t]||t;
    el.appendChild(sp);
    total += PIECE_VAL[t]||0;
  });
  if(total>0){
    var diff=document.createElement('span'); diff.className='capture-diff'; diff.textContent='+'+total;
    el.appendChild(diff);
  }
}

/* ═══════════════════════════════════════════════════════════════
   9.  MOVE LOG
   ═══════════════════════════════════════════════════════════════ */
function renderMoveLog(){
  var el=dom['move-log']; el.innerHTML='';
  var log=App.moveLog; if(!log||!log.length) return;
  var moveNum=1;
  for(var i=0;i<log.length;i+=2){
    var row=document.createElement('div'); row.className='move-row';
    var num=document.createElement('span'); num.className='move-num'; num.textContent=moveNum+'.';
    row.appendChild(num);
    var w=document.createElement('span'); w.className='move-cell';
    w.textContent=moveNotation(log[i]);
    if(i===log.length-1) w.classList.add('last');
    row.appendChild(w);
    if(log[i+1]){
      var b=document.createElement('span'); b.className='move-cell';
      b.textContent=moveNotation(log[i+1]);
      if(i+1===log.length-1) b.classList.add('last');
      row.appendChild(b);
    }
    el.appendChild(row); moveNum++;
  }
  el.scrollTop=el.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   10.  CHAT
   ═══════════════════════════════════════════════════════════════ */
function sendChat(){
  var input=dom['chat-input'], text=input.value.trim();
  if(!text||App.mode!=='online') return;
  input.value='';
  api('POST','/api/rooms/'+App.online.roomId+'/chat',{ token:App.online.token, text:text }).catch(function(){});
}
function renderChat(messages){
  var el=dom['chat-messages']; el.innerHTML='';
  var color=App.online.color;
  (messages||[]).forEach(function(m){
    var d=document.createElement('div'); d.className='chat-msg '+(m.sender===color?'mine':'theirs');
    d.textContent=m.text; el.appendChild(d);
  });
  el.scrollTop=el.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   11.  GAME INTERACTION
   ═══════════════════════════════════════════════════════════════ */
function onGameClick(row,col){
  var view=getView(); if(!view||view.over||App.busy) return;
  var color=myColor(); if(view.turn!==color) return;
  if(App.selected && App.legalMoves.some(function(m){ return m[0]===row&&m[1]===col; })){
    attemptMove(App.selected,[row,col]); return;
  }
  var cell=view.board[row][col];
  if(cell&&cell.color===color&&!cell.hidden){ selectPiece(row,col); return; }
  clearSel(); renderGameBoard();
}

function selectPiece(row,col){
  App.selected=[row,col];
  if(App.mode==='cpu'){ App.legalMoves=Engine.getLegalMoves(App.localGame,row,col); renderGameBoard(); return; }
  api('POST','/api/rooms/'+App.online.roomId+'/legal-moves',{ token:App.online.token, from:[row,col] }).then(function(d){
    App.legalMoves=d.moves||[]; renderGameBoard();
  }).catch(function(){ App.legalMoves=[]; renderGameBoard(); });
}
function clearSel(){ App.selected=null; App.legalMoves=[]; }

function attemptMove(from,to){
  App.busy=true; clearSel();
  if(App.mode==='cpu'){
    var r=Engine.makeMove(App.localGame,App.localPlayerColor,from,to);
    if(r.ok){
      App.localGame=r.game;
      var lm=r.game.lastMove||{};
      App.moveLog.push({ piece:lm.piece||'?', from:from, to:to, captured:lm.captured, color:App.localPlayerColor });
      renderGameBoard(); updateGameUI(); renderMoveLog();
      if(App.localGame.over) setTimeout(showResult,500);
      else scheduleCpu();
    } else { showToast(r.error,true); }
    App.busy=false; return;
  }
  api('POST','/api/rooms/'+App.online.roomId+'/move',{ token:App.online.token, from:from, to:to }).then(function(d){
    if(d.error) showToast(d.error,true); else syncOnline(d);
  }).catch(function(){ showToast('Error',true); }).finally(function(){ App.busy=false; });
}

function activateFog(){
  var view=getView(); if(!view||view.over) return;
  var color=myColor(); if(view.turn!==color){ showToast(td('notYourTurn'),true); return; }
  if(App.mode==='cpu'){
    var r=Engine.hideAllPieces(App.localGame,App.localPlayerColor);
    if(r.ok){ App.localGame=r.game; showToast(td('fogActivated')); renderGameBoard(); updateGameUI(); }
    else showToast(r.error||td('fogUsed'),true);
    return;
  }
  api('POST','/api/rooms/'+App.online.roomId+'/hide',{ token:App.online.token }).then(function(d){
    if(d.error) showToast(d.error,true); else { showToast(td('fogActivated')); syncOnline(d); }
  }).catch(function(){ showToast('Error',true); });
}

function requestRematch(){
  closeResult();
  if(App.mode==='cpu'){ App.localGame=null; clearSel(); App.moveLog=[]; initSetup(resolveColor(),'cpu'); return; }
  api('POST','/api/rooms/'+App.online.roomId+'/rematch',{ token:App.online.token }).then(function(d){
    if(d.error){ showToast(d.error,true); return; }
    App.setup.ready=false; clearSel(); App.moveLog=[];
    syncOnline(d);
    if(d.phase==='setup') initSetup(App.online.color,'online',d.mySetup);
  }).catch(function(){ showToast('Error',true); });
}

/* ═══════════════════════════════════════════════════════════════
   12.  TUTORIAL (interactive on-board)
   ═══════════════════════════════════════════════════════════════ */
var TUT_BOARDS = [];

function buildTutBoards(){
  var empty = Engine.emptyBoard();
  // Step 0: empty board
  TUT_BOARDS[0]=empty;
  // Step 1: white pieces arranged
  TUT_BOARDS[1]=Engine.createDefaultSetup('white');
  // Step 2: both sides — show white, black hidden
  var both = Engine.emptyBoard();
  var ws = Engine.createDefaultSetup('white');
  var bs = Engine.createDefaultSetup('black');
  for(var r=0;r<8;r++) for(var c=0;c<8;c++){
    both[r][c] = ws[r][c] || bs[r][c] || null;
  }
  TUT_BOARDS[2] = both;
  // Step 3: mid-game (move a pawn)
  var mid = Engine.emptyBoard();
  for(var r2=0;r2<8;r2++) for(var c2=0;c2<8;c2++) mid[r2][c2]=ws[r2][c2]||bs[r2][c2]||null;
  mid[6][4]=null; mid[4][4]='P'; // e2->e4
  mid[1][4]=null; mid[3][4]='P'; // e7->e5
  TUT_BOARDS[3]=mid;
  // Step 4: fog pulse (same as step 3, handled visually)
  TUT_BOARDS[4]=mid;
}

function openTutorial(){
  if(!TUT_BOARDS.length) buildTutBoards();
  App.tutorial.active=true; App.tutorial.step=0;
  showScreen('tutorial-screen');
  renderTutStep();
}

function renderTutStep(){
  var steps=td('tutorialSteps');
  if(!Array.isArray(steps)||!steps.length) return;
  var s=App.tutorial.step;
  if(s>=steps.length) s=steps.length-1;
  var step=steps[s];
  dom['tut-speech'].textContent=step.text;
  dom['tut-step-ind'].textContent=(s+1)+' / '+steps.length;
  dom['tut-next-btn'].textContent = s>=steps.length-1 ? (App.locale==='tr'?'Bitir':'Finish') : t('tut-next-btn');
  // Render tutorial board
  renderTutBoard(s);
}

function renderTutBoard(stepIdx){
  var bEl=dom['tutorial-board']; bEl.innerHTML='';
  var boardData=TUT_BOARDS[stepIdx]||Engine.emptyBoard();
  var fogStep = stepIdx===4; // fog pulse step: hide black pieces

  for(var dr=0;dr<8;dr++) for(var dc=0;dc<8;dc++){
    var row=dr, col=dc;
    var sq=document.createElement('button'); sq.className='square '+sqColor(row,col);
    var type=boardData[row][col];
    if(type){
      var isBlack = row<=1; // rows 0,1 are black home area
      var sp=document.createElement('span');
      if(stepIdx>=2 && isBlack && type!=='K'){
        // Show hidden (mystery) pieces for opponent
        if(fogStep || stepIdx===2){
          sp.className='piece mystery'; sp.textContent='?';
        } else {
          // Step 3: show some revealed (moved pieces visible)
          if(row===3 && col===4){
            sp.className='piece black'; sp.textContent=SYMBOLS.black.P;
          } else {
            sp.className='piece mystery'; sp.textContent='?';
          }
        }
      } else {
        var pColor = isBlack ? 'black' : 'white';
        sp.className='piece '+pColor; sp.textContent=SYMBOLS[pColor][type];
      }
      sq.appendChild(sp);
    }
    // Highlight moved pieces in step 3
    if(stepIdx===3){
      if((row===4&&col===4)||(row===3&&col===4)) sq.classList.add('last-to');
    }
    if(dc===0){ var cr=document.createElement('span'); cr.className='coord coord-rank'; cr.textContent=8-row; sq.appendChild(cr); }
    if(dr===7){ var cf=document.createElement('span'); cf.className='coord coord-file'; cf.textContent=FILES[col]; sq.appendChild(cf); }
    bEl.appendChild(sq);
  }
}

function nextTut(){
  var steps=td('tutorialSteps');
  if(App.tutorial.step>=steps.length-1){ closeTut(); return; }
  App.tutorial.step++; renderTutStep();
}
function closeTut(){
  App.tutorial.active=false;
  showScreen('menu-screen');
}

/* ═══════════════════════════════════════════════════════════════
   13.  GUIDE (floating Wraith)
   ═══════════════════════════════════════════════════════════════ */
function updateGuide(){
  if(!App.guide.enabled){ dom['guide-panel'].classList.add('hidden'); return; }
  var steps=td('guideSteps');
  if(!Array.isArray(steps)||App.guide.step>=steps.length){ dismissGuide(); return; }
  var s=steps[App.guide.step];
  dom['guide-title'].textContent=s.title; dom['guide-text'].textContent=s.text;
  dom['guide-panel'].classList.remove('hidden');
}
function nextGuide(){
  App.guide.step++; localStorage.setItem('shadow-guide-step',App.guide.step);
  var steps=td('guideSteps');
  if(!Array.isArray(steps)||App.guide.step>=steps.length) dismissGuide(); else updateGuide();
}
function dismissGuide(){
  App.guide.enabled=false; localStorage.setItem('shadow-guide-off','1');
  dom['guide-panel'].classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   14.  RESULT MODAL
   ═══════════════════════════════════════════════════════════════ */
function showResult(){
  var view=getView(); if(!view) return;
  var color=myColor(), title='', text='';
  if(view.winner===color){ title=td('youWin'); text=view.result==='checkmate'?td('checkmate'):td('kingCapture'); }
  else if(view.winner){ title=td('youLose'); text=view.result==='checkmate'?td('checkmate'):td('kingCapture'); }
  else { title=td('draw'); text=td('stalemate'); }
  dom['result-title'].textContent=title; dom['result-text'].textContent=text;
  dom['result-modal'].classList.add('open');
}
function closeResult(){ dom['result-modal'].classList.remove('open'); }

/* ═══════════════════════════════════════════════════════════════
   15.  TABS
   ═══════════════════════════════════════════════════════════════ */
function switchTab(tabId){
  dom['tab-moves-btn'].classList.toggle('active', tabId==='moves');
  dom['tab-chat-btn'].classList.toggle('active', tabId==='chat');
  dom['moves-panel'].classList.toggle('active', tabId==='moves');
  dom['chat-panel'].classList.toggle('active', tabId==='chat');
}

/* ═══════════════════════════════════════════════════════════════
   16.  NAVIGATION
   ═══════════════════════════════════════════════════════════════ */
function goToMenu(){
  stopPolling(); clearTimeout(App.cpuTimer); closeResult(); clearSel();
  App.mode=null; App.localGame=null; App.setup.ready=false; App.moveLog=[];
  App.online={ roomId:null, token:null, color:null, state:null, chatLen:0 };
  showScreen('menu-screen'); dom['menu-status'].textContent=''; updateGuide();
}

/* ═══════════════════════════════════════════════════════════════
   17.  INIT
   ═══════════════════════════════════════════════════════════════ */
function init(){
  cacheDom();
  applyTheme(App.theme);
  applyColorChoice(App.chosenColor);
  applyTexts();
  updateGuide();

  // Lang
  dom['lang-tr-btn'].addEventListener('click',function(){ setLang('tr'); });
  dom['lang-en-btn'].addEventListener('click',function(){ setLang('en'); });

  // Color picker
  dom['pick-white'].addEventListener('click',function(){ applyColorChoice('white'); });
  dom['pick-random'].addEventListener('click',function(){ applyColorChoice('random'); });
  dom['pick-black'].addEventListener('click',function(){ applyColorChoice('black'); });

  // Theme picker
  dom['theme-picker'].addEventListener('click',function(e){
    var btn=e.target.closest('.theme-opt'); if(!btn) return;
    applyTheme(btn.getAttribute('data-theme'));
  });

  // Menu
  dom['create-room-btn'].addEventListener('click',createRoom);
  dom['cpu-mode-btn'].addEventListener('click',startCpuMode);
  dom['open-tutorial-btn'].addEventListener('click',openTutorial);
  dom['join-room-btn'].addEventListener('click',function(){ joinRoom(dom['room-code-input'].value.trim()); });
  dom['room-code-input'].addEventListener('keydown',function(e){ if(e.key==='Enter') joinRoom(dom['room-code-input'].value.trim()); });
  dom['room-code-input'].placeholder='ABC123';

  // Setup
  dom['setup-back-btn'].addEventListener('click',goToMenu);
  dom['setup-clear-btn'].addEventListener('click',clearDraft);
  dom['setup-default-btn'].addEventListener('click',applyDefault);
  dom['setup-ready-btn'].addEventListener('click',onSetupReady);
  dom['setup-eraser-btn'].addEventListener('click',function(){
    App.setup.heldPiece = App.setup.heldPiece===EMPTY_TOOL ? null : EMPTY_TOOL;
    renderPalette(); updateSetupHeld();
  });
  dom['copy-link-btn'].addEventListener('click',function(){
    var inp=dom['share-link-input'];
    if(navigator.clipboard) navigator.clipboard.writeText(inp.value).then(function(){ showToast(td('copied')); });
    else { inp.select(); document.execCommand('copy'); showToast(td('copied')); }
  });

  // Tutorial
  dom['tut-skip-btn'].addEventListener('click',closeTut);
  dom['tut-next-btn'].addEventListener('click',nextTut);

  // Game
  dom['hide-btn'].addEventListener('click',activateFog);
  dom['extra-action-btn'].addEventListener('click',goToMenu);
  dom['rematch-btn'].addEventListener('click',requestRematch);

  // Tabs
  dom['tab-moves-btn'].addEventListener('click',function(){ switchTab('moves'); });
  dom['tab-chat-btn'].addEventListener('click',function(){ switchTab('chat'); });

  // Chat
  dom['chat-send-btn'].addEventListener('click',sendChat);
  dom['chat-input'].addEventListener('keydown',function(e){ if(e.key==='Enter') sendChat(); });

  // Guide
  dom['guide-skip-btn'].addEventListener('click',dismissGuide);
  dom['guide-next-btn'].addEventListener('click',nextGuide);

  // Result
  dom['result-primary'].addEventListener('click',requestRematch);
  dom['result-secondary'].addEventListener('click',goToMenu);

  // URL auto-join
  var params=new URLSearchParams(window.location.search);
  var rc=params.get('room'); if(rc) joinRoom(rc);
}

window.addEventListener('DOMContentLoaded',init);
