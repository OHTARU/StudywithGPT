const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: "*",
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const RECORDS_FILE = path.join(__dirname, 'records.json');
let records = [];
let activePlayers = {};

// 기록 파일 로드
if (fs.existsSync(RECORDS_FILE)) {
    const data = fs.readFileSync(RECORDS_FILE, 'utf-8');
    records = JSON.parse(data);
}

// 기록 저장
function saveRecords() {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
}

// 기록 API
app.get('/records', (req, res) => {
    res.json(records);
});

app.post('/records', (req, res) => {
    const { name, score } = req.body;
    if (!name || score === undefined) {
        return res.status(400).send('이름과 점수가 필요합니다');
    }
    
    records.push({
        name,
        score,
        date: new Date().toLocaleString()
    });
    
    saveRecords();
    res.status(201).send('기록이 저장되었습니다');
});

// 소켓 연결 및 플레이어 상태 관리 개선
io.on('connection', (socket) => {
    console.log('사용자 접속:', socket.id);

    socket.on('startGame', (player) => {
        activePlayers[socket.id] = {
            ...player,
            gameStarted: true,
            lastUpdate: Date.now()
        };
        io.emit('updatePlayers', activePlayers);
    });

    socket.on('updateScore', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].score = data.score;
            activePlayers[socket.id].lastUpdate = Date.now();
            io.emit('updatePlayers', activePlayers);
        }
    });

    socket.on('endGame', (data) => {
        if (activePlayers[socket.id]) {
            delete activePlayers[socket.id];
            io.emit('updatePlayers', activePlayers);
        }
    });

    socket.on('disconnect', () => {
        if (activePlayers[socket.id]) {
            delete activePlayers[socket.id];
            io.emit('updatePlayers', activePlayers);
        }
        console.log('사용자 연결 해제:', socket.id);
    });
});

// 비활성 플레이어 정리 (5분 이상 업데이트 없으면 제거)
setInterval(() => {
    const now = Date.now();
    let updated = false;
    Object.entries(activePlayers).forEach(([id, player]) => {
        if (now - player.lastUpdate > 300000) { // 5분
            delete activePlayers[id];
            updated = true;
        }
    });
    if (updated) {
        io.emit('updatePlayers', activePlayers);
    }
}, 60000); // 1분마다 체크

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
});