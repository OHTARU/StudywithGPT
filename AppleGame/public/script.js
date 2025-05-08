// ── 설정 ──
const rows = 10, cols = 12;
let socketConnected = false;
let gameStarted = false, score = 0, timeLeft = 120, playerName = "";
const serverUrl = window.location.hostname === 'localhost'
  ? 'http://localhost:3000' : 'https://studywithgpt.onrender.com';
const socket = io(serverUrl, {
  withCredentials: true,
  transports: ['websocket','polling']
});

// ── DOM ──
const canvas       = document.getElementById('gameCanvas');
const ctx          = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const startButton  = document.getElementById('startButton');
const recordList   = document.getElementById('recordList');
const playerList   = document.getElementById('playerList');

// 캔버스 크기
canvas.width  = canvas.clientWidth;
canvas.height = canvas.clientHeight;

// 버퍼캔버스
const buffer    = document.createElement('canvas');
buffer.width   = canvas.width;
buffer.height  = canvas.height;
const bufferCtx = buffer.getContext('2d');

// 드래그 상태
let isDragging = false, dragStartX, dragStartY, dragEndX, dragEndY;

// 사과 배열
let apples = [];

// ── 소켓 이벤트 ──
socket.on('connect', () => {
  socketConnected = true;
  loadRecords();
});
socket.on('disconnect', () => {
  socketConnected = false;
});
setInterval(() => {
  if (socketConnected) loadRecords();
}, 60000);

// ── 레코드 로드 ──
function loadRecords() {
  fetch(`${serverUrl}/records`)
    .then(r=>r.ok? r.json(): Promise.reject())
    .then(data => {
      recordList.innerHTML = '';
      data.sort((a,b)=>b.score-a.score)
          .forEach(r=>{
            const d = document.createElement('div');
            d.className = 'record-item';
            d.textContent = `${r.name}: ${r.score}점 (${new Date(r.date).toLocaleString()})`;
            recordList.append(d);
          });
    })
    .catch(_=> recordList.innerHTML = '<div class="record-item">불러올 수 없습니다.</div>');
}

// ── 플레이어 업데이트 ──
socket.on('updatePlayers', players => {
  playerList.innerHTML = '';
  const arr = Array.isArray(players)? players: Object.values(players);
  if (!arr.length) {
    playerList.innerHTML = '<div class="player-item">접속한 플레이어 없음</div>';
  } else {
    arr.forEach(p => {
      const d = document.createElement('div');
      d.className = 'player-item';
      if (p.name===playerName) d.classList.add('current-player');
      d.textContent = `${p.name}: ${p.score}점`;
      playerList.append(d);
    });
  }
});

// ── 타이머 ──
let timerId;
function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(()=>{
    if (!gameStarted) return;
    timeLeft--;
    timerDisplay.textContent = `남은 시간: ${timeLeft}초`;
    if (timeLeft<=0) {
      clearInterval(timerId);
      finishGame();
    }
  },1000);
}

// ── 게임 시작/종료 토글 ──
startButton.addEventListener('click', ()=>{
  if (!gameStarted) {
    playerName = prompt('사용자 이름을 입력하세요:');
    if (!playerName) return;
    gameStarted = true;
    score = 0; timeLeft = 120;
    scoreDisplay.textContent = `점수: ${score}`;
    timerDisplay.textContent = `남은 시간: ${timeLeft}초`;
    startButton.textContent = '게임 종료';
    startButton.classList.add('active');
    initializeApples();
    if (socketConnected) socket.emit('startGame',{name:playerName,score:0});
    startTimer();
    requestAnimationFrame(gameLoop);
  } else {
    finishGame();
  }
});

function finishGame() {
  gameStarted = false;
  startButton.textContent = '게임 시작';
  startButton.classList.remove('active');
  if (socketConnected) socket.emit('endGame',{name:playerName});
  // 기록 저장
  fetch(`${serverUrl}/records`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name:playerName,score})
  }).then(()=>{
    alert(`게임 종료! 최종 점수: ${score}`);
    loadRecords();
  });
}

// ── 드래그 박스 & 입력 ──
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  let x, y;
  if (e.touches) {
    x = (e.touches[0].clientX - rect.left)*scaleX;
    y = (e.touches[0].clientY - rect.top)*scaleY;
  } else {
    x = (e.clientX - rect.left)*scaleX;
    y = (e.clientY - rect.top)*scaleY;
  }
  return {x,y};
}

canvas.addEventListener('mousedown',e=>{
  if(!gameStarted) return;
  isDragging = true;
  const p = getCanvasPos(e);
  dragStartX = dragEndX = p.x;
  dragStartY = dragEndY = p.y;
});
canvas.addEventListener('mousemove',e=>{
  if(!isDragging||!gameStarted) return;
  const p = getCanvasPos(e);
  dragEndX = p.x; dragEndY = p.y;
});
canvas.addEventListener('mouseup',e=>{
  if(!isDragging||!gameStarted) return;
  selectApples();
  isDragging=false;
});
canvas.addEventListener('mouseleave', ()=>{ isDragging=false; });
canvas.addEventListener('touchstart',e=>{
  e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousedown',{clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}));
});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousemove',{clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}));
});
canvas.addEventListener('touchend',e=>{
  e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mouseup',{clientX:e.changedTouches[0].clientX,clientY:e.changedTouches[0].clientY}));
});

// 사과 선택 처리
function selectApples() {
  const boxLeft   = Math.min(dragStartX,dragEndX);
  const boxRight  = Math.max(dragStartX,dragEndX);
  const boxTop    = Math.min(dragStartY,dragEndY);
  const boxBottom = Math.max(dragStartY,dragEndY);
  const picked = apples.filter(a=>{
    if(!a.visible) return false;
    const cx = a.x + a.size/2, cy = a.y + a.size/2;
    return cx>=boxLeft && cx<=boxRight && cy>=boxTop && cy<=boxBottom;
  });
  const sum = picked.reduce((s,a)=>s+a.value,0);
  if (sum===10) removeApples(picked);
}

// ── 사과 초기화 ──
function initializeApples() {
  apples = [];
  const pad = 8;
  const availW = canvas.width  - pad*(cols+1);
  const availH = canvas.height - pad*(rows+1);
  const rawSize = Math.min(availW/cols,availH/rows);
  const size    = Math.max(0, Math.floor(rawSize*0.9)-1);
  // 중앙 정렬 오프셋
  const gridW = cols*size + (cols-1)*pad;
  const gridH = rows*size + (rows-1)*pad;
  const offsetX = (canvas.width - gridW)/2;
  const offsetY = (canvas.height - gridH)/2;

  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      apples.push({
        x:c*(size+pad)+offsetX,
        y:r*(size+pad)+offsetY,
        size,
        value: Math.ceil(Math.random()*9),
        visible:true
      });
    }
  }
}

// ── 사과 그리기 ──
function drawApples() {
  bufferCtx.clearRect(0,0,canvas.width,canvas.height);
  apples.forEach(a=>{
    if(!a.visible) return;
    const cx = a.x + a.size/2, cy = a.y + a.size/2;
    // 그라데이션 + 그림자
    bufferCtx.save();
    const grad = bufferCtx.createRadialGradient(
      cx - a.size*0.15, cy - a.size*0.15, a.size*0.2,
      cx, cy, a.size*0.5
    );
    grad.addColorStop(0,'#ff7070');
    grad.addColorStop(1,'#e00');
    bufferCtx.fillStyle = grad;
    bufferCtx.shadowColor = 'rgba(0,0,0,0.2)';
    bufferCtx.shadowBlur  = 4;
    bufferCtx.beginPath();
    bufferCtx.arc(cx,cy,a.size/2,0,Math.PI*2);
    bufferCtx.fill();
    bufferCtx.restore();

    // 숫자
    bufferCtx.save();
    bufferCtx.fillStyle = '#fff';
    bufferCtx.shadowColor = 'rgba(0,0,0,0.3)';
    bufferCtx.shadowBlur  = 2;
    bufferCtx.font = `bold ${Math.floor(a.size*0.6)}px Arial`;
    bufferCtx.textAlign = 'center';
    bufferCtx.textBaseline = 'middle';
    bufferCtx.fillText(a.value,cx,cy);
    bufferCtx.restore();
  });
  // 버퍼→실제 캔버스
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(buffer,0,0);
}

// ── 드래그 박스 ──
function drawDragBox() {
  if(!isDragging) return;
  const x = Math.min(dragStartX,dragEndX);
  const y = Math.min(dragStartY,dragEndY);
  const w = Math.abs(dragEndX-dragStartX);
  const h = Math.abs(dragEndY-dragStartY);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,123,255,0.6)';
  ctx.fillStyle   = 'rgba(0,123,255,0.2)';
  ctx.lineWidth   = 2;
  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x,y,w,h);
  ctx.restore();
}

// ── 사과 제거 애니메이션 ──
function removeApples(picked) {
  const D=200, start=performance.now();
  function anim(t){
    const p = Math.min((t-start)/D,1);
    picked.forEach(a=>{
      const cx=a.x+a.size/2, cy=a.y+a.size/2;
      ctx.save();
      ctx.globalAlpha = 1-p;
      ctx.beginPath();
      ctx.arc(cx,cy,a.size/2*(1-p/2),0,Math.PI*2);
      ctx.fillStyle = 'rgba(255,0,0,0.4)';
      ctx.fill();
      ctx.restore();
    });
    drawApples();
    if(p<1) requestAnimationFrame(anim);
    else {
      picked.forEach(a=>a.visible=false);
      updateScore(score + picked.length);
    }
  }
  requestAnimationFrame(anim);
}

// ── 점수 갱신 ──
function updateScore(newScore) {
  score = newScore;
  scoreDisplay.textContent = `점수: ${score}`;
  if(socketConnected) socket.emit('updateScore',{name:playerName,score});
}

// ── 메인 루프 ──
function gameLoop() {
  if (gameStarted) {
    drawApples();
    drawDragBox();
    requestAnimationFrame(gameLoop);
  }
}

// 초기 로드
window.onload = ()=> {
  initializeApples();
  drawApples();
  loadRecords();
};
