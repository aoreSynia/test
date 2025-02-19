const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
require('dotenv').config();

const app = express();

// Cấu hình CORS chi tiết hơn
app.use(cors({
  origin: '*', // Cho phép tất cả các origin trong môi trường development
  methods: ['GET', 'POST', 'OPTIONS'], // Các methods được phép
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
const PORT = process.env.PORT || 3000;

const mongoUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=${process.env.MONGO_AUTH_SOURCE}&directConnection=true`;

// Optimize MongoDB options for serverless
const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 1,
  minPoolSize: 0,
  socketTimeoutMS: 5000,
  connectTimeoutMS: 5000,
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

  try {
    cachedClient = await MongoClient.connect(mongoUrl, mongoOptions);
    cachedDb = cachedClient.db(process.env.MONGO_DB);
    return { client: cachedClient, db: cachedDb };
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

// API Status endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "API is running",
    endpoints: {
      status: "GET /",
      collections: "GET /collections",
      collectionData: "GET /data/:collection"
    }
  });
});

// API Health Check với test database
app.get("/health", async (req, res) => {
  try {
    const { client, db } = await connectToDatabase();
    const collections = await db.getCollectionNames();
    res.json({ 
      status: "healthy",
      database: "connected",
      collectionsCount: collections.length
    });
  } catch (error) {
    res.status(500).json({ 
      status: "unhealthy",
      error: error.message
    });
  }
});

// Get all collections using MongoDB command
app.get("/collections", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const result = await db.command({ listCollections: 1, nameOnly: true });
    const collectionNames = result.cursor.firstBatch.map(col => col.name);
    res.json(collectionNames);
  } catch (err) {
    console.error('Error getting collections:', err);
    res.status(500).json({
      error: 'Failed to get collections',
      details: err.message
    });
  }
});

app.get("/data/:collection", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const collection = req.params.collection;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Kiểm tra collection tồn tại
    const result = await db.command({ listCollections: 1, nameOnly: true, filter: { name: collection } });
    const collectionExists = result.cursor.firstBatch.length > 0;
    
    if (!collectionExists) {
      return res.status(404).json({ error: `Collection "${collection}" không tồn tại` });
    }

    // Đếm tổng số documents
    const total = await db.collection(collection).countDocuments();

    // Lấy dữ liệu với phân trang
    const data = await db.collection(collection)
      .find({})
      .sort({ _id: -1 }) // Sắp xếp theo _id mới nhất
      .skip(skip)
      .limit(limit)
      .toArray();
    
    if (data.length === 0) {
      return res.json({ 
        message: 'Không có dữ liệu trong collection này',
        total: 0,
        page: page,
        limit: limit,
        data: []
      });
    }

    res.json({
      total: total,
      page: page,
      limit: limit,
      data: data
    });
  } catch (err) {
    console.error('Error getting collection data:', err);
    res.status(500).json({ 
      error: 'Database query failed',
      details: err.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something broke!',
    details: err.message
  });
});

// For Vercel, we export the app instead of calling listen
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET /');
    console.log('- GET /health');
    console.log('- GET /collections');
    console.log('- GET /data/:collection');
  });
}

module.exports = app;
