const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
require('dotenv').config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const mongoUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=${process.env.MONGO_AUTH_SOURCE}&directConnection=true`;

// Optimize MongoDB options for serverless
const mongoOptions = {
  serverSelectionTimeoutMS: 3000, // Reduced from 5000 to 3000
  maxPoolSize: 1, // Important for serverless
  minPoolSize: 0, // Important for serverless
  socketTimeoutMS: 3000, // Add socket timeout
  connectTimeoutMS: 3000, // Add connection timeout
  useNewUrlParser: true,
  useUnifiedTopology: true
};

// Reuse MongoDB connection
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  cachedClient = await MongoClient.connect(mongoUrl, mongoOptions);
  cachedDb = cachedClient.db(process.env.MONGO_DB);

  return { client: cachedClient, db: cachedDb };
}

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "API is running" });
});

app.get("/data/:collection", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const collection = req.params.collection;

    const collections = await db.listCollections().toArray();
    const collectionExists = collections.some(col => col.name === collection);
    
    if (!collectionExists) {
      return res.status(404).json({ error: `Collection "${collection}" không tồn tại` });
    }

    const data = await db.collection(collection).find({}).limit(10).toArray();
    
    if (data.length === 0) {
      return res.json({ message: 'Không có dữ liệu trong collection này' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ 
      error: 'Database query failed',
      details: err.message 
    });
  }
});

// For Vercel, we export the app instead of calling listen
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {});
}

module.exports = app;
