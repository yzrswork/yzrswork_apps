/* =========================================================
 * あそぼう！ — 3歳児向けモンテッソーリ・ミニゲーム集
 * Vanilla JS / 単一HTML / オフライン動作
 * ========================================================= */
(function(){
'use strict';

/* ----- 共通定数 ----- */
const COLORS = {
  red:'#FF6B6B', orange:'#FFA94D', yellow:'#FFD93D',
  green:'#6BCB77', blue:'#4D96FF', purple:'#B983FF'
};
const COLOR_KEYS = Object.keys(COLORS);
const SHAPES = ['circle','triangle','square','star','heart'];
const SHAPE_COLORS = ['red','orange','yellow','green','blue','purple'];

/* ----- ユーティリティ ----- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const rand = (min,max) => Math.random()*(max-min)+min;
const randInt = (min,max) => Math.floor(rand(min,max+1));
const pick = arr => arr[randInt(0,arr.length-1)];
const shuffle = arr => {
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = randInt(0,i);
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
};

/* =========================================================
 * 音響: Web Audio APIで合成
 * ========================================================= */
const Audio = (() => {
  let ctx = null;
  let muted = false;
  let masterGain = null;

  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(ctx.destination);
    }
    if(ctx.state === 'suspended'){
      ctx.resume().catch(()=>{});
    }
    return ctx;
  }

  function setMuted(v){
    muted = !!v;
    if(masterGain){
      masterGain.gain.setTargetAtTime(muted?0:0.3, ctx.currentTime, 0.02);
    }
    try{ localStorage.setItem('asobou_muted', muted?'1':'0'); }catch(e){}
  }

  function isMuted(){ return muted; }

  function loadMuted(){
    try{
      muted = localStorage.getItem('asobou_muted') === '1';
    }catch(e){ muted = false; }
    return muted;
  }

  function tone(freq, dur, type='sine', when=0, gain=1){
    if(muted) return;
    const c = ensure();
    if(!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    osc.connect(g).connect(masterGain);
    osc.start(t0);
    osc.stop(t0+dur+0.05);
  }

  // 正解音: 上昇音階（ピンポン♪相当）
  function correct(){
    tone(660, 0.18, 'triangle', 0,    0.6);
    tone(880, 0.22, 'triangle', 0.10, 0.6);
  }

  // 木琴風（形ゲーム）
  function xylo(){
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f,i)=>tone(f, 0.32, 'triangle', i*0.08, 0.55));
  }

  // 数字読み上げ風の柔らかいポップ
  function pop(n){
    const f = 440 + (n-1)*60;
    tone(f, 0.16, 'sine', 0, 0.55);
  }

  // 鍵盤
  const PIANO_FREQS = [
    261.63, 293.66, 329.63, 349.23,
    392.00, 440.00, 493.88, 523.25
  ];
  function piano(idx){
    const f = PIANO_FREQS[idx];
    if(!f) return;
    if(muted) return;
    const c = ensure();
    if(!c) return;
    const t0 = c.currentTime;
    // やわらかい音色: triangle + sine の足し合わせ
    [['triangle',0.5],['sine',0.4]].forEach(([type,gain])=>{
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0+0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+0.9);
      osc.connect(g).connect(masterGain);
      osc.start(t0);
      osc.stop(t0+1.0);
    });
  }

  // 花火パチパチ
  function sparkle(){
    if(muted) return;
    const base = [880, 1320, 1760, 2200];
    base.forEach((f,i)=>{
      tone(f * (1+rand(-0.05,0.05)), 0.18, 'sine', i*0.08, 0.45);
    });
  }

  return { ensure, setMuted, isMuted, loadMuted,
           correct, xylo, pop, piano, sparkle };
})();

/* =========================================================
 * 画面ルーター
 * ========================================================= */
const Router = (() => {
  let currentGame = null;

  function show(id){
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    const backLink = document.getElementById('back-to-index');
    if(backLink) backLink.style.display = id === 'screen-game' ? 'none' : '';
  }

  function home(){
    if(currentGame && currentGame.destroy) currentGame.destroy();
    currentGame = null;
    const stage = $('#game-stage');
    stage.innerHTML = '';
    show('screen-menu');
  }

  function startGame(name){
    if(currentGame && currentGame.destroy) currentGame.destroy();
    const stage = $('#game-stage');
    stage.innerHTML = '';
    show('screen-game');
    const factory = Games[name];
    if(factory) currentGame = factory(stage);
  }

  return { show, home, startGame };
})();

/* =========================================================
 * SVG生成ヘルパー
 * ========================================================= */
function svgEl(tag, attrs){
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function shapeSvg(shape, fill, opts={}){
  const stroke = opts.stroke || 'none';
  const strokeWidth = opts.strokeWidth || 0;
  const svg = svgEl('svg', {viewBox:'0 0 100 100'});
  let node;
  switch(shape){
    case 'circle':
      node = svgEl('circle', {cx:50, cy:50, r:42, fill, stroke, 'stroke-width':strokeWidth});
      break;
    case 'square':
      node = svgEl('rect', {x:10, y:10, width:80, height:80, rx:14, fill, stroke, 'stroke-width':strokeWidth});
      break;
    case 'triangle':
      node = svgEl('polygon', {points:'50,8 92,86 8,86', fill, stroke, 'stroke-width':strokeWidth, 'stroke-linejoin':'round'});
      break;
    case 'star': {
      const pts = [];
      for(let i=0;i<10;i++){
        const r = i%2===0?44:18;
        const a = (-Math.PI/2) + i*(Math.PI/5);
        pts.push((50+r*Math.cos(a)).toFixed(1)+','+(50+r*Math.sin(a)).toFixed(1));
      }
      node = svgEl('polygon', {points:pts.join(' '), fill, stroke, 'stroke-width':strokeWidth, 'stroke-linejoin':'round'});
      break;
    }
    case 'heart':
      node = svgEl('path', {
        d:'M50 86 C 18 64, 8 42, 22 26 C 32 16, 44 18, 50 30 C 56 18, 68 16, 78 26 C 92 42, 82 64, 50 86 Z',
        fill, stroke, 'stroke-width':strokeWidth, 'stroke-linejoin':'round'
      });
      break;
  }
  svg.appendChild(node);
  return svg;
}

/* =========================================================
 * パーティクル演出
 * ========================================================= */
function burst(stage, x, y, count=24, palette=null){
  const layer = document.createElement('div');
  layer.className = 'particle-layer';
  stage.appendChild(layer);
  const colors = palette || Object.values(COLORS);
  const parts = [];
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (i/count)*Math.PI*2 + rand(-0.2,0.2);
    const dist = rand(80, 180);
    p.style.setProperty('--px', x+'px');
    p.style.setProperty('--py', y+'px');
    p.style.setProperty('--tx', (Math.cos(angle)*dist)+'px');
    p.style.setProperty('--ty', (Math.sin(angle)*dist)+'px');
    p.style.background = colors[i % colors.length];
    p.style.width = p.style.height = (8+rand(0,12))+'px';
    layer.appendChild(p);
    parts.push(p);
  }
  setTimeout(()=>{ if(layer.parentNode) layer.parentNode.removeChild(layer); }, 1100);
}

/* =========================================================
 * 共通: 「もう一度」+ 花火
 * ========================================================= */
function clearShow(stage, onAgain){
  // 花火パーティクルを複数バースト
  const rect = stage.getBoundingClientRect();
  const ox = rect.width/2, oy = rect.height/2;
  burst(stage, ox, oy, 28);
  setTimeout(()=>burst(stage, ox*0.5, oy*0.7, 20), 200);
  setTimeout(()=>burst(stage, ox*1.5, oy*0.7, 20), 400);
  setTimeout(()=>burst(stage, ox, oy*1.2, 24), 600);
  Audio.sparkle();
  setTimeout(Audio.sparkle, 250);
  setTimeout(Audio.sparkle, 500);

  const overlay = document.createElement('div');
  overlay.className = 'firework-overlay';
  const msg = document.createElement('div');
  msg.className = 'firework-message';
  msg.textContent = '🎉';
  overlay.appendChild(msg);
  stage.appendChild(overlay);

  const btn = document.createElement('button');
  btn.className = 'again-btn';
  btn.textContent = 'もういっかい';
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if(btn.parentNode) btn.parentNode.removeChild(btn);
    onAgain();
  });
  stage.appendChild(btn);
}

/* =========================================================
 * ゲーム1: いろあわせ
 * ========================================================= */
function GameColor(stage){
  const TOTAL = 5;
  let round = 0;
  let target = null;
  let listeners = [];

  function addListener(el, type, fn){
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  }
  function clearListeners(){
    listeners.forEach(([el,type,fn]) => el.removeEventListener(type, fn));
    listeners = [];
  }

  function buildProgress(){
    const dots = document.createElement('div');
    dots.className = 'progress-dots';
    for(let i=0;i<TOTAL;i++){
      const d = document.createElement('div');
      d.className = 'progress-dot' + (i<round?' done':'');
      dots.appendChild(d);
    }
    return dots;
  }

  function nextRound(){
    clearListeners();
    stage.innerHTML = '';

    if(round >= TOTAL){
      clearShow(stage, () => { round = 0; nextRound(); });
      return;
    }

    target = pick(COLOR_KEYS);
    const choices = shuffle(COLOR_KEYS);

    stage.appendChild(buildProgress());

    const targetArea = document.createElement('div');
    targetArea.className = 'target-area';
    const targetBall = document.createElement('div');
    targetBall.className = 'target-ball';
    targetBall.style.background = COLORS[target];
    targetArea.appendChild(targetBall);
    stage.appendChild(targetArea);

    const choicesArea = document.createElement('div');
    choicesArea.className = 'choices-area';
    const grid = document.createElement('div');
    grid.className = 'choices-grid cols-3';
    choicesArea.appendChild(grid);
    stage.appendChild(choicesArea);

    choices.forEach(key => {
      const ball = document.createElement('button');
      ball.className = 'color-ball';
      ball.style.background = COLORS[key];
      ball.dataset.color = key;
      ball.setAttribute('aria-label', key);
      grid.appendChild(ball);

      addListener(ball, 'pointerdown', e => {
        e.preventDefault();
        Audio.ensure();
        if(ball.dataset.locked) return;
        if(key === target){
          ball.dataset.locked = '1';
          handleCorrect(ball, targetBall);
        } else {
          // モンテッソーリ: 不正解はやさしいバウンドのみ
          ball.classList.remove('soft-bounce');
          void ball.offsetWidth;
          ball.classList.add('soft-bounce');
        }
      });
    });
  }

  function handleCorrect(ball, targetBall){
    Audio.correct();
    const r1 = ball.getBoundingClientRect();
    const r2 = targetBall.getBoundingClientRect();
    const dx = (r2.left + r2.width/2) - (r1.left + r1.width/2);
    const dy = (r2.top + r2.height/2) - (r1.top + r1.height/2);
    ball.style.setProperty('--fly-to', `translate(${dx}px,${dy}px)`);
    ball.classList.add('fly-to-target');
    targetBall.classList.add('glow-correct');

    const stageRect = stage.getBoundingClientRect();
    burst(stage,
      r2.left + r2.width/2 - stageRect.left,
      r2.top + r2.height/2 - stageRect.top,
      18, [COLORS[target], '#fff', COLORS[target]]);

    setTimeout(()=>{
      round++;
      nextRound();
    }, 900);
  }

  nextRound();

  return {
    destroy(){ clearListeners(); }
  };
}

/* =========================================================
 * ゲーム2: かたちあわせ
 * ========================================================= */
function GameShape(stage){
  const TOTAL = 5;
  let round = 0;
  let target = null;
  let listeners = [];

  function addListener(el, type, fn){
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  }
  function clearListeners(){
    listeners.forEach(([el,t,f]) => el.removeEventListener(t,f));
    listeners = [];
  }

  function buildProgress(){
    const dots = document.createElement('div');
    dots.className = 'progress-dots';
    for(let i=0;i<TOTAL;i++){
      const d = document.createElement('div');
      d.className = 'progress-dot' + (i<round?' done':'');
      dots.appendChild(d);
    }
    return dots;
  }

  function nextRound(){
    clearListeners();
    stage.innerHTML = '';

    if(round >= TOTAL){
      clearShow(stage, ()=>{ round = 0; nextRound(); });
      return;
    }

    target = pick(SHAPES);
    const choices = shuffle(SHAPES);

    stage.appendChild(buildProgress());

    const targetArea = document.createElement('div');
    targetArea.className = 'target-area target-shape';
    // シルエット枠（薄いグレー）
    targetArea.appendChild(shapeSvg(target, 'rgba(74,63,53,0.18)'));
    stage.appendChild(targetArea);

    const choicesArea = document.createElement('div');
    choicesArea.className = 'choices-area';
    const grid = document.createElement('div');
    grid.className = 'choices-grid cols-5';
    choicesArea.appendChild(grid);
    stage.appendChild(choicesArea);

    // 各形にランダムな色を割り当てる
    const palette = shuffle(SHAPE_COLORS).slice(0, choices.length);
    choices.forEach((shape, idx) => {
      const tile = document.createElement('button');
      tile.className = 'shape-tile';
      tile.appendChild(shapeSvg(shape, COLORS[palette[idx]]));
      grid.appendChild(tile);

      addListener(tile, 'pointerdown', e => {
        e.preventDefault();
        Audio.ensure();
        if(tile.dataset.locked) return;
        if(shape === target){
          tile.dataset.locked = '1';
          handleCorrect(tile, targetArea);
        } else {
          tile.classList.remove('soft-bounce');
          void tile.offsetWidth;
          tile.classList.add('soft-bounce');
        }
      });
    });
  }

  function handleCorrect(tile, targetArea){
    Audio.xylo();
    const targetSvg = targetArea.querySelector('svg');
    const r1 = tile.getBoundingClientRect();
    const r2 = targetSvg.getBoundingClientRect();
    const dx = (r2.left + r2.width/2) - (r1.left + r1.width/2);
    const dy = (r2.top + r2.height/2) - (r1.top + r1.height/2);
    tile.style.setProperty('--fly-to', `translate(${dx}px,${dy}px)`);
    tile.classList.add('fly-to-target');
    targetArea.classList.add('glow-correct');

    const stageRect = stage.getBoundingClientRect();
    burst(stage,
      r2.left + r2.width/2 - stageRect.left,
      r2.top + r2.height/2 - stageRect.top,
      18);

    setTimeout(()=>{
      round++;
      nextRound();
    }, 900);
  }

  nextRound();
  return { destroy(){ clearListeners(); } };
}

/* =========================================================
 * ゲーム3: かぞえてみよう
 * ========================================================= */
function GameCount(stage){
  const TOTAL = 5;
  const FRUITS = ['🍎','🍊','🍌','🍓','🍇','🥝'];
  let round = 0;
  let count = 0;
  let listeners = [];

  function addListener(el, type, fn){
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  }
  function clearListeners(){
    listeners.forEach(([el,t,f]) => el.removeEventListener(t,f));
    listeners = [];
  }

  function buildProgress(){
    const dots = document.createElement('div');
    dots.className = 'progress-dots';
    for(let i=0;i<TOTAL;i++){
      const d = document.createElement('div');
      d.className = 'progress-dot' + (i<round?' done':'');
      dots.appendChild(d);
    }
    return dots;
  }

  function nextRound(){
    clearListeners();
    stage.innerHTML = '';

    if(round >= TOTAL){
      clearShow(stage, ()=>{ round = 0; nextRound(); });
      return;
    }

    count = randInt(1,5);
    const fruit = pick(FRUITS);

    stage.appendChild(buildProgress());

    const countStage = document.createElement('div');
    countStage.className = 'count-stage';
    const items = [];
    for(let i=0;i<count;i++){
      const span = document.createElement('span');
      span.className = 'count-item';
      span.textContent = fruit;
      countStage.appendChild(span);
      items.push(span);
    }
    stage.appendChild(countStage);

    const choicesArea = document.createElement('div');
    choicesArea.className = 'choices-area';
    const grid = document.createElement('div');
    grid.className = 'choices-grid cols-5';
    choicesArea.appendChild(grid);
    stage.appendChild(choicesArea);

    [1,2,3,4,5].forEach(n => {
      const t = document.createElement('button');
      t.className = 'number-tile';
      t.textContent = n;
      grid.appendChild(t);

      addListener(t, 'pointerdown', e => {
        e.preventDefault();
        Audio.ensure();
        if(t.dataset.locked) return;
        if(n === count){
          t.dataset.locked = '1';
          handleCorrect(t, items);
        } else {
          t.classList.remove('soft-bounce');
          void t.offsetWidth;
          t.classList.add('soft-bounce');
        }
      });
    });
  }

  let hopTimers = [];

  function handleCorrect(tile, items){
    tile.classList.add('glow-correct');
    // 順番に跳ねながらポップ音
    items.forEach((it, i) => {
      const id = setTimeout(() => {
        it.classList.add('hop');
        Audio.pop(i+1);
        setTimeout(() => it.classList.remove('hop'), 400);
      }, i * 280);
      hopTimers.push(id);
    });

    const totalTime = items.length * 280 + 300;
    const id2 = setTimeout(() => {
      Audio.correct();
      round++;
      nextRound();
    }, totalTime + 100);
    hopTimers.push(id2);
  }

  nextRound();

  return {
    destroy(){
      clearListeners();
      hopTimers.forEach(clearTimeout);
      hopTimers = [];
    }
  };
}

/* =========================================================
 * ゲーム4: おとあそび（鍵盤）
 * ========================================================= */
function GamePiano(stage){
  let listeners = [];
  function addListener(el,type,fn){
    el.addEventListener(type,fn);
    listeners.push([el,type,fn]);
  }
  function clearListeners(){
    listeners.forEach(([el,t,f])=>el.removeEventListener(t,f));
    listeners = [];
  }

  const NAMES = ['ド','レ','ミ','ファ','ソ','ラ','シ','ド'];
  const KEY_COLORS = [
    '#FF6B6B','#FFA94D','#FFD93D','#A0E36B',
    '#6BCB77','#4D96FF','#7B8BFF','#B983FF'
  ];

  stage.innerHTML = '';
  const piano = document.createElement('div');
  piano.className = 'piano-stage';
  stage.appendChild(piano);

  for(let i=0;i<8;i++){
    const k = document.createElement('button');
    k.className = 'key';
    k.style.background = `linear-gradient(180deg, ${KEY_COLORS[i]} 0%, ${shade(KEY_COLORS[i],-15)} 100%)`;
    const lbl = document.createElement('span');
    lbl.className = 'key-label';
    lbl.textContent = NAMES[i];
    k.appendChild(lbl);
    piano.appendChild(k);

    addListener(k, 'pointerdown', e => {
      e.preventDefault();
      Audio.ensure();
      Audio.piano(i);
      k.classList.add('active');
      // 波紋
      const rect = k.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.setProperty('--rx', x+'px');
      ripple.style.setProperty('--ry', y+'px');
      // 虹色の波紋
      ripple.style.background = `radial-gradient(circle, ${shade(KEY_COLORS[(i+2)%8],30)} 0%, rgba(255,255,255,0) 70%)`;
      k.appendChild(ripple);
      setTimeout(()=>{ if(ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 850);
    });
    addListener(k, 'pointerup', e => { k.classList.remove('active'); });
    addListener(k, 'pointercancel', e => { k.classList.remove('active'); });
    addListener(k, 'pointerleave', e => { k.classList.remove('active'); });
  }

  return { destroy(){ clearListeners(); } };
}

function shade(hex, percent){
  // hex: #RRGGBB, percent: -100..100
  const n = parseInt(hex.slice(1),16);
  let r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  const f = percent/100;
  if(f >= 0){
    r = Math.round(r + (255-r)*f);
    g = Math.round(g + (255-g)*f);
    b = Math.round(b + (255-b)*f);
  } else {
    r = Math.round(r*(1+f));
    g = Math.round(g*(1+f));
    b = Math.round(b*(1+f));
  }
  return '#' + ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}

/* =========================================================
 * ゲーム登録
 * ========================================================= */
const Games = {
  color: GameColor,
  shape: GameShape,
  count: GameCount,
  piano: GamePiano
};

/* =========================================================
 * 起動
 * ========================================================= */
function init(){
  Audio.loadMuted();
  updateMuteButtons();

  // メニューカード
  $$('.menu-card').forEach(card => {
    card.addEventListener('pointerdown', e => {
      e.preventDefault();
      Audio.ensure();
      const name = card.dataset.game;
      Router.startGame(name);
    });
  });

  // 共通アクション(home / mute)
  document.addEventListener('pointerdown', e => {
    Audio.ensure(); // 初回タップでAudioContext起動
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const act = btn.dataset.action;
    if(act === 'home'){
      e.preventDefault();
      Router.home();
    } else if(act === 'toggle-mute'){
      e.preventDefault();
      Audio.setMuted(!Audio.isMuted());
      updateMuteButtons();
    }
  }, true);

  // マルチタッチ無視: 副指のpointerdownはpreventDefault
  let activePointer = null;
  document.addEventListener('pointerdown', e => {
    if(activePointer === null){
      activePointer = e.pointerId;
    } else if(e.pointerId !== activePointer){
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('pointerup', e => {
    if(e.pointerId === activePointer) activePointer = null;
  }, true);
  document.addEventListener('pointercancel', e => {
    if(e.pointerId === activePointer) activePointer = null;
  }, true);

  // ダブルタップズーム抑止 (iOS Safari)
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if(now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, {passive:false});

  // ジェスチャ無効
  ['gesturestart','gesturechange','gestureend'].forEach(t => {
    document.addEventListener(t, e => e.preventDefault());
  });

  // スプラッシュ → メニュー
  setTimeout(() => {
    Router.show('screen-menu');
  }, 1500);
}

function updateMuteButtons(){
  const m = Audio.isMuted();
  $$('.mute-btn').forEach(b => { b.textContent = m ? '🔇' : '🔊'; });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
