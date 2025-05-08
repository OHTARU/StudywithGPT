// —— 설정 —— 
const rows = 10;
const cols = 12;
const padding = 8;            // 사과 간격
const socket = io(
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://studywithgpt.onrender.com',
  { transports: ['websocket','polling'] }
);
let socketConnected = false;
let gameStarted = false;
let score = 0;
let timeLeft = 120;
let isDragging = false;
let dragStartX, dragStartY, dragEndX, dragEndY;
const apples = [];

// —— 캔버스 셋업 —— 
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
// 버퍼 캔버스(퍼포먼스 최적화)
const buffer = document.createElement('canvas');
buffer.width  = canvas.width;
buffer.height = canvas.height;
const btx = buffer.getContext('2d');

// —— DOM 참조 —— 
const scoreDisplay  = document.getElementById('score');
const timerDisplay  = document.getElementById('timer');
const startButton   = document.getElementById('startButton');
const recordList    = document.getElementById('recordList');
const playerList    = document.getElementById('playerList');

// —— 소켓 연결 이벤트 —— 
socket.on('connect', () => {
  socketConnected = true; loadRecords();
});
socket.on('disconnect', () => socketConnected = false);
socket.on('updatePlayers', data => {
  playerList.innerHTML = '';
  (Array.isArray(data)? data: Object.values(data))
    .forEach(p => {
      const div = document.createElement('div');
      div.textContent = `${p.name}: ${p.score}점`;
      playerList.appendChild(div);
    });
});

// —— 기록 불러오기 —— 
function loadRecords() {
  fetch((window.location.hostname==='localhost'?'http://localhost:3000':'https://studywithgpt.onrender.com') + '/records')
    .then(r => r.json())
    .then(arr => {
      recordList.innerHTML = '';
      arr.sort((a,b)=>b.score-a.score).forEach(r => {
        const d = document.createElement('div');
        d.textContent = `${r.name}: ${r.score}점 (${new Date(r.date).toLocaleString()})`;
        recordList.appendChild(d);
      });
    })
    .catch(_=> recordList.textContent = '불러오기 실패');
}

// —— 사과 배열 초기화 —— 
function initApples(){
  apples.length = 0;
  const availW = canvas.width - (cols+1)*padding;
  const availH = canvas.height - (rows+1)*padding;
  const size   = Math.floor(Math.min(availW/cols, availH/rows));
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      apples.push({
        x: padding + x*(size+padding),
        y: padding + y*(size+padding),
        size,
        value: Math.ceil(Math.random()*9),
        visible: true
      });
    }
  }
}

// —— 그리기 함수 —— 
function drawApples(){
  btx.clearRect(0,0,buffer.width,buffer.height);
  apples.forEach(a=>{
    if(!a.visible) return;
    const cx = a.x + a.size/2, cy = a.y + a.size/2;
    // 원
    btx.beginPath();
    btx.arc(cx,cy,a.size/2 - 1,0,Math.PI*2);
    btx.fillStyle = '#ff4c4c';
    btx.fill();
    // 숫자
    btx.fillStyle = '#fff';
    btx.font = `bold ${Math.floor(a.size*0.6)}px Arial`;
    btx.textAlign = 'center'; btx.textBaseline = 'middle';
    btx.fillText(a.value, cx, cy);
  });
  // 버퍼 → 메인
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(buffer,0,0);
}

// —— 드래그 박스 표시 —— 
function drawDragBox(){
  if(!isDragging) return;
  const x = Math.min(dragStartX,dragEndX),
        y = Math.min(dragStartY,dragEndY),
        w = Math.abs(dragEndX-dragStartX),
        h = Math.abs(dragEndY-dragStartY);
  if(w<5||h<5) return;
  ctx.fillStyle = 'rgba(0,128,255,0.2)';
  ctx.strokeStyle= '#0080ff';
  ctx.lineWidth =2;
  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x,y,w,h);
}

// —— 마우스/터치 포지션 계산 —— 
function mapPos(e){
  const r=canvas.getBoundingClientRect(),
        sx=canvas.width/r.width,
        sy=canvas.height/r.height;
  const cx = ('touches' in e? e.touches[0].clientX: e.clientX) - r.left,
        cy = ('touches' in e? e.touches[0].clientY: e.clientY) - r.top;
  return { x: cx*sx, y: cy*sy };
}

// —— 이벤트 바인딩 —— 
canvas.addEventListener('mousedown', e=>{
  if(!gameStarted) return;
  const p = mapPos(e);
  isDragging=true; dragStartX=p.x; dragStartY=p.y; dragEndX=p.x; dragEndY=p.y;
});
canvas.addEventListener('mousemove', e=>{
  if(!isDragging) return;
  dragEndX = mapPos(e).x;
  dragEndY = mapPos(e).y;
});
canvas.addEventListener('mouseup', endDrag);
canvas.addEventListener('mouseleave', ()=>isDragging=false);

canvas.addEventListener('touchstart', e=>{
  e.preventDefault();
  if(!gameStarted) return;
  const p = mapPos(e);
  isDragging=true; dragStartX=p.x; dragStartY=p.y; dragEndX=p.x; dragEndY=p.y;
});
canvas.addEventListener('touchmove', e=>{
  e.preventDefault(); if(!isDragging) return;
  const p=mapPos(e);
  dragEndX=p.x; dragEndY=p.y;
});
canvas.addEventListener('touchend', endDrag);
canvas.addEventListener('touchcancel', ()=>isDragging=false);

// —— 드래그 종료 처리 —— 
function endDrag(){
  if(!isDragging) return; isDragging=false;
  const l = Math.min(dragStartX,dragEndX),
        r = Math.max(dragStartX,dragEndX),
        t = Math.min(dragStartY,dragEndY),
        b = Math.max(dragStartY,dragEndY);
  const sel = apples.filter(a=>{
    if(!a.visible) return false;
    const cx=a.x+a.size/2, cy=a.y+a.size/2;
    return cx>=l&&cx<=r&&cy>=t&&cy<=b;
  });
  const sum = sel.reduce((s,a)=>s+a.value,0);
  if(sum===10){
    sel.forEach(a=>a.visible=false);
    updateScore(score+sel.length);
  }
}

// —— 스코어 업데이트 —— 
function updateScore(v){
  score = v;
  scoreDisplay.textContent = `점수: ${score}`;
  if(socketConnected) socket.emit('updateScore', { score, name: playerName });
}

// —— 타이머 —— 
let timerId;
function startTimer(){
  timerId = setInterval(()=>{
    if(!gameStarted) return;
    timeLeft--; timerDisplay.textContent=`남은 시간: ${timeLeft}초`;
    if(timeLeft<=0){
      clearInterval(timerId);
      endGame();
    }
  },1000);
}

// —— 게임 시작 / 종료 —— 
let playerName;
function startGame(){
  playerName = prompt('사용자 이름을 입력하세요:');
  if(!playerName) return;
  gameStarted=true; timeLeft=120; score=0;
  scoreDisplay.textContent='점수: 0';
  timerDisplay.textContent=`남은 시간: 120초`;
  startButton.textContent='게임 종료';
  initApples(); drawLoop();
  if(socketConnected) socket.emit('startGame',{name:playerName,score:0});
  startTimer();
}
function endGame(){
  gameStarted=false;
  startButton.textContent='게임 시작';
  if(socketConnected) socket.emit('endGame',{name:playerName});
  fetch('/records',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name:playerName,score})
  }).then(()=>loadRecords());
}

// —— 메인 루프 —— 
function drawLoop(){
  if(!gameStarted) return;
  drawApples();
  drawDragBox();
  requestAnimationFrame(drawLoop);
}

// —— 버튼 바인딩 —— 
startButton.addEventListener('click',()=>{
  gameStarted? endGame(): startGame();
});

// —— 초기화 —— 
window.addEventListener('load',()=>{
  initApples();
  drawApples();
  loadRecords();
});
