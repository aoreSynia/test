const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
require('dotenv').config();

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const mongoUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=${process.env.MONGO_AUTH_SOURCE}&directConnection=true`;

const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
};

app.get("/data/:collection", async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, mongoOptions);
    const db = client.db(process.env.MONGO_DB);
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
  } finally {
    if (client) {
      await client.close();
    }
  }
});

app.listen(PORT, () => {});
