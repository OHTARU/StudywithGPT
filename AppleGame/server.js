require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');

const app = express();
const server = require('http').createServer(app);

// MongoDB 설정
const client = new MongoClient(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
});

let db;

// MongoDB 연결 함수
async function connectDB() {
    try {
        await client.connect();
        console.log('MongoDB에 연결됨');
        db = client.db('apple-game');
        
        // 연결 테스트
        await db.command({ ping: 1 });
        console.log("Pinged your deployment. MongoDB에 성공적으로 연결되었습니다.");
        
        // 컬렉션 초기화
        if (!await db.listCollections({name: 'records'}).hasNext()) {
            await db.createCollection('records');
            console.log('records 컬렉션 생성됨');
        }
        return true;
    } catch (err) {
        console.error('MongoDB 연결 실패:', err);
        return false;
    }
}

// Socket.IO 설정
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));  // 정적 파일 제공

// 기본 라우트 추가
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API 엔드포인트
app.get('/records', async (req, res) => {
    try {
        if (!db) {
            throw new Error('데이터베이스 연결이 없습니다.');
        }
        const records = await db.collection('records')
            .find()
            .sort({ score: -1 })
            .limit(10)
            .toArray();
        res.json(records);
    } catch (err) {
        console.error('기록 조회 실패:', err);
        res.status(500).json({ error: '기록을 불러올 수 없습니다.' });
    }
});

app.post('/records', async (req, res) => {
    try {
        if (!db) {
            throw new Error('데이터베이스 연결이 없습니다.');
        }
        const { name, score } = req.body;
        if (!name || score === undefined) {
            return res.status(400).json({ error: '이름과 점수가 필요합니다.' });
        }
        
        await db.collection('records').insertOne({
            name,
            score,
            date: new Date()
        });
        res.status(201).json({ message: '기록이 저장되었습니다.' });
    } catch (err) {
        console.error('기록 저장 실패:', err);
        res.status(500).json({ error: '기록을 저장할 수 없습니다.' });
    }
});

// 서버 시작 부분 수정
const PORT = process.env.PORT || 3000;

async function startServer() {
    const isConnected = await connectDB();
    if (isConnected) {
        server.listen(PORT, () => {
            console.log(`서버가 시작되었습니다.`);
            console.log(`웹 페이지 접속 주소: http://localhost:${PORT}`);
        });
    } else {
        console.error('서버를 시작할 수 없습니다: 데이터베이스 연결 실패');
        process.exit(1);
    }
}

startServer();

// 소켓 연결 처리
const activePlayers = new Map();

io.on('connection', (socket) => {
    console.log('클라이언트 연결됨:', socket.id);
    
    socket.on('startGame', (player) => {
        activePlayers.set(socket.id, {
            id: socket.id,
            name: player.name,
            score: 0
        });
        io.emit('updatePlayers', Array.from(activePlayers.values()));
    });
    
    socket.on('updateScore', (data) => {
        const player = activePlayers.get(socket.id);
        if (player) {
            player.score = data.score;
            io.emit('updatePlayers', Array.from(activePlayers.values()));
        }
    });
    
    socket.on('disconnect', () => {
        activePlayers.delete(socket.id);
        io.emit('updatePlayers', Array.from(activePlayers.values()));
        console.log('클라이언트 연결 해제:', socket.id);
    });
});

// 정상 종료 처리
process.on('SIGINT', async () => {
    try {
        await client.close();
        console.log('MongoDB 연결이 안전하게 종료되었습니다.');
        process.exit(0);
    } catch (err) {
        console.error('MongoDB 연결 종료 중 오류:', err);
        process.exit(1);
    }
});