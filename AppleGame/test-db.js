require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('연결 테스트 성공!');
        await client.close();
    } catch (err) {
        console.error('연결 테스트 실패:', err);
    }
}

testConnection();