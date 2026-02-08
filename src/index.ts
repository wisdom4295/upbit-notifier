import express from 'express';
import cors from 'cors';
import {pro} from "ccxt";

const app = express();
const PORT = process.env.PORT ||3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res)=>{
    res.json({
        message:'🚀 Upbit Notifier Backend v1.0',
        status:'healthy',
        timestamp:new Date().toDateString()
    })
})

app.listen(PORT, ()=>{
    console.log(`🌐 Server running on http://localhost:${PORT}`);
})
