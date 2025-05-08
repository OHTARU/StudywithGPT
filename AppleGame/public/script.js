// 서버 및 소켓 설정
const serverUrl = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://studywithgpt.onrender.com';
const socket = io(serverUrl, { transports: ['websocket'], withCredentials: true });

// DOM 요소
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const scoreEl  = document.getElementById('score');
const timerEl  = document.getElementById('timer');
const recordsEl = document.getElementById('records');
const playersEl = document.getElementById('players');

let rows = 10, cols = 17, padding = 10;
let apples = [], appleSize;
let score = 0, timeLeft = 120, gameStarted = false;
let isDragging = false, dragStart, dragEnd;

// 캔버스 크기 조정
function resizeCanvas() {
  // 캔버스 가로폭을 요소 크기에 맞춤
  canvas.width  = Math.min(window.innerWidth * 0.9, 680);
  canvas.height = canvas.width * (10/17);
  appleSize = (canvas.width - padding * (cols + 1)) / cols * 0.95;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// 사과 초기화
function initApples() {
  apples = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      apples.push({
        x: padding + c * (appleSize + padding),
        y: padding + r * (appleSize + padding),
        value: Math.floor(Math.random() * 9) + 1,
        visible: true
      });
    }
  }
}

// 사과 그리기
function drawApples() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  apples.forEach(a => {
    if (!a.visible) return;
    // 원
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(a.x + appleSize/2, a.y + appleSize/2, appleSize/2, 0, 2*Math.PI);
    ctx.fill();
    // 숫자
    ctx.fillStyle = 'white';
    ctx.font = `${appleSize*0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.value, a.x + appleSize/2, a.y + appleSize/2);
  });
}

// 드래그 박스 그리기
function drawDragBox() {
  if (!isDragging) return;
  const x = Math.min(dragStart.x, dragEnd.x);
  const y = Math.min(dragStart.y, dragEnd.y);
  const w = Math.abs(dragEnd.x - dragStart.x);
  const h = Math.abs(dragEnd.y - dragStart.y);
  if (w < 5 || h < 5) return;

  ctx.fillStyle = 'rgba(0,0,255,0.2)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,255,0.8)';
  ctx.strokeRect(x, y, w, h);

  // 합계 표시
  const selected = apples.filter(a => a.visible &&
    a.x + appleSize/2 >= x && a.x + appleSize/2 <= x+w &&
    a.y + appleSize/2 >= y && a.y + appleSize/2 <= y+h
  );
  const sum = selected.reduce((s,a)=>s+a.value, 0);
  ctx.fillStyle = sum===10 ? '#4CAF50' : 'black';
  ctx.font = `bold ${appleSize*0.3}px Arial`;
  ctx.fillText(`합계: ${sum}`, x + w/2, y - 5);
}

// 마우스/터치 위치 계산
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) / rect.width  * canvas.width,
    y: (clientY - rect.top ) / rect.height * canvas.height
  };
}

// 이벤트 핸들러
canvas.addEventListener('mousedown', e => {
  if (!gameStarted) return;
  isDragging = true;
  dragStart = dragEnd = getPos(e);
});
canvas.addEventListener('mousemove', e => {
  if (!isDragging) return;
  dragEnd = getPos(e);
  drawApples(); drawDragBox();
});
canvas.addEventListener('mouseup', e => {
  if (!isDragging) return;
  isDragging = false;
  const selected = apples.filter(a => a.visible &&
    a.x + appleSize/2 >= Math.min(dragStart.x, dragEnd.x) &&
    a.x + appleSize/2 <= Math.max(dragStart.x, dragEnd.x) &&
    a.y + appleSize/2 >= Math.min(dragStart.y, dragEnd.y) &&
    a.y + appleSize/2 <= Math.max(dragStart.y, dragEnd.y)
  );
  const sum = selected.reduce((s,a)=>s+a.value, 0);
  if (sum === 10) {
    selected.forEach(a => a.visible=false);
    score += selected.length;
    scoreEl.innerText = score;
    socket.emit('updateScore', { score, name: playerName });
  }
  drawApples();
});
canvas.addEventListener('mouseleave', _=>{
  if (isDragging) { isDragging=false; drawApples(); }
});
// 터치 이벤트도 동일하게 처리
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousedown', e)); });
canvas.addEventListener('touchmove',  e=>{ e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousemove', e)); });
canvas.addEventListener('touchend',   e=>{ e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mouseup', e)); });

// 게임 시작/종료
let timerInterval, playerName;
function startGame() {
  playerName = prompt('사용자 이름을 입력하세요:');
  if (!playerName) return alert('이름을 입력해야 시작합니다.');
  gameStarted = true; score=0; timeLeft=120;
  scoreEl.innerText = score; timerEl.innerText = timeLeft;
  initApples(); drawApples();
  socket.emit('startGame', { name: playerName });
  timerInterval = setInterval(()=>{
    timeLeft--; timerEl.innerText = timeLeft;
    if (timeLeft<=0) endGame();
  }, 1000);
}
function endGame() {
  clearInterval(timerInterval);
  gameStarted = false;
  socket.emit('endGame', { name: playerName });
  fetch(`${serverUrl}/records`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name: playerName, score })
  }).then(loadRecords);
}
startBtn.addEventListener('click', ()=> gameStarted ? endGame() : startGame());

// 기록 불러오기
function loadRecords() {
  fetch(`${serverUrl}/records`)
    .then(r=>r.json())
    .then(data=>{
      recordsEl.innerHTML = '';
      data.sort((a,b)=>b.score-a.score)
        .forEach(r=>{
          const div = document.createElement('div');
          div.className = 'record-item';
          div.textContent = `${r.name}: ${r.score}점 (${new Date(r.date).toLocaleString()})`;
          recordsEl.appendChild(div);
        });
    }).catch(_=> recordsEl.innerText='불러오기 실패');
}

// 실시간 플레이어 업데이트
socket.on('updatePlayers', list=>{
  playersEl.innerHTML = '';
  list.forEach(p=>{
    const d = document.createElement('div');
    d.className = 'player-item';
    d.textContent = `${p.name}: ${p.score}점`;
    playersEl.appendChild(d);
  });
});

// 처음 로드 시
socket.on('connect', _=> loadRecords());