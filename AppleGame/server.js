require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);

// MongoDB 연결
const client = new MongoClient(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('apple-game');
        console.log("MongoDB 연결 성공");
        if (!await db.listCollections({ name: 'records' }).hasNext()) {
            await db.createCollection('records');
            console.log("records 컬렉션 생성됨");
        }
        return true;
    } catch (err) {
        console.error("MongoDB 연결 실패:", err);
        return false;
    }
}

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors());
app.use(express.json());

// 정적 파일 제공 (index.html 포함)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/records', async (req, res) => {
    try {
        const records = await db.collection('records')
            .find()
            .sort({ score: -1 })
            .limit(10)
            .toArray();
        res.json(records);
    } catch (err) {
        console.error("기록 조회 실패:", err);
        res.status(500).json({ error: "기록 조회 실패" });
    }
});

app.post('/records', async (req, res) => {
    try {
        const { name, score } = req.body;
        if (!name || score == null) {
            return res.status(400).json({ error: '이름과 점수가 필요합니다' });
        }

        await db.collection('records').insertOne({
            name,
            score,
            date: new Date()
        });

        res.status(201).json({ message: "기록 저장 완료" });
    } catch (err) {
        console.error("기록 저장 실패:", err);
        res.status(500).json({ error: "기록 저장 실패" });
    }
});

const PORT = process.env.PORT || 3000;

async function start() {
    const connected = await connectDB();
    if (connected) {
        server.listen(PORT, () => {
            console.log(`서버 시작: ${PORT}번 포트`);
        });
    } else {
        console.error("DB 연결 실패 - 서버 시작 불가");
        process.exit(1);
    }
}

start();

// 소켓 통신
const activePlayers = new Map();

io.on('connection', (socket) => {
    console.log('클라이언트 연결:', socket.id);

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
    });
});

process.on('SIGINT', async () => {
    await client.close();
    console.log("MongoDB 연결 종료");
    process.exit(0);
});
