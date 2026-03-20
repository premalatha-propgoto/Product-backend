const express = require("express");
const cors = require("cors");
const redisClient = require("./redisClient");
const { connectProducer, sendQueryLog } = require("./kafkaProducer");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: "postgres",
  host: "postgres",
  database: "product_db",
  password: "Prema",
  port: 5432,
});

app.get("/", (req, res) => {
  res.send("Server running");
});

app.post("/product", async (req, res) => {
  const {
    title,
    description,
    category,
    price,
    discount_percentage,
    rating,
    stock,
    brand,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO products
       (title, description, category, price, discount_percentage, rating, stock, brand, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING id`,
      [
        title,
        description,
        category,
        price || 0,
        discount_percentage || 0,
        rating || 0,
        stock || 0,
        brand || "",
      ],
    );
    await redisClient.flushAll();

    const insertedId = result.rows[0].id;
    res.json({ message: "Product created successfully", id: insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.get("/get_products/:id", async (req, res) => {
  const start = Date.now();

  const id = req.params.id;
  const cacheKey = `product:${id}`;

  try {
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Cache HIT ");

      await sendQueryLog({
        route: "/get_products/:id",
        productId: id,
        source: "CACHE",
        responseTime: Date.now() - start,
      });

      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache MISS ");

    const result = await pool.query(
      "SELECT * FROM products WHERE id=$1 AND is_active=true",
      [id],
    );

    if (result.rows.length === 0) {
      await sendQueryLog({
        route: "/get_products/:id",
        productId: id,
        source: "NOT_FOUND",
        responseTime: Date.now() - start,
      });

      return res.status(404).json({ message: "Product not found" });
    }

    const product = result.rows[0];

    await redisClient.setEx(cacheKey, 3660, JSON.stringify(product));

    await sendQueryLog({
      route: "/get_products/:id",
      productId: id,
      source: "DB",
      responseTime: Date.now() - start,
    });

    res.json(product);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get("/get_products", async (req, res) => {
  const start = Date.now();

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const keyword = req.query.keyword?.trim() || "";
  const category = req.query.category || "all";

  const cacheKey = `products:${page}:${limit}:${keyword}:${category}`;

  try {
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Cache HIT ");

      sendQueryLog({
        route: "/get_products",
        source: "CACHE",
        page,
        limit,
        keyword,
        category,
        responseTime: Date.now() - start,
      }).catch(console.error);

      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache MISS ");

    const offset = (page - 1) * limit;

    let filters = [];
    let filterParams = [];
    let idx = 1;

    if (keyword) {
      filters.push(
        `(LOWER(title) LIKE LOWER($${idx}) 
          OR LOWER(category) LIKE LOWER($${idx}) 
          OR CAST(price AS TEXT) LIKE $${idx})`
      );
      filterParams.push(`%${keyword}%`);
      idx++;
    }

    if (category !== "all") {
      filters.push(`LOWER(category) = LOWER($${idx})`);
      filterParams.push(category);
      idx++;
    }

    let whereClause = `WHERE is_active=true`;
    if (filters.length > 0) {
      whereClause += ` AND ` + filters.join(" AND ");
    }

    const dataQuery = `
      SELECT * FROM products 
      ${whereClause}
      ORDER BY id
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const dataParams = [...filterParams, limit, offset];

    const countQuery = `
      SELECT COUNT(*) FROM products
      ${whereClause}
    `;

    const countParams = [...filterParams];

    const data = await pool.query(dataQuery, dataParams);
    const countData = await pool.query(countQuery, countParams);

    const totalRows = parseInt(countData.rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const response = {
      page,
      limit,
      totalPages,
      totalRows,
      data: data.rows,
    };

    await redisClient.setEx(cacheKey, 3660, JSON.stringify(response));

    sendQueryLog({
      route: "/get_products",
      source: "DB",
      page,
      limit,
      keyword,
      category,
      totalRows,
      responseTime: Date.now() - start,
    }).catch(console.error);

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.post("/search", async (req, res) => {
  const start = Date.now();

  const { product_id, keyword, category } = req.body;

  const cacheKey = `search:${keyword}:${category}`;

  try {
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Search Cache HIT ");

      sendQueryLog({
        route: "/search",
        source: "CACHE",
        keyword,
        category,
        productId: product_id,
        responseTime: Date.now() - start,
      }).catch(console.error);

      return res.json(JSON.parse(cachedData));
    }

    console.log("Search Cache MISS ");

    if (keyword && keyword.trim() !== "") {
      await pool.query(
        `INSERT INTO search_history(product_id, search_keyword) VALUES ($1,$2)`,
        [product_id, keyword],
      );
    }

    let query = `SELECT * FROM products WHERE is_active=true`;
    const params = [];
    let idx = 1;

    if (keyword && keyword.trim() !== "") {
      query += ` AND (LOWER(title) LIKE LOWER($${idx}) OR LOWER(category) LIKE LOWER($${idx}) OR CAST(price AS TEXT) LIKE $${idx})`;
      params.push(`%${keyword}%`);
      idx++;
    }

    if (category && category !== "all") {
      query += ` AND category=$${idx}`;
      params.push(category);
      idx++;
    }

    query += " ORDER BY id LIMIT 50";

    const result = await pool.query(query, params);

    const response = { data: result.rows };

    await redisClient.setEx(cacheKey, 3660, JSON.stringify(response));

    sendQueryLog({
      route: "/search",
      source: "DB",
      keyword,
      category,
      productId: product_id,
      resultCount: result.rows.length,
      responseTime: Date.now() - start,
    }).catch(console.error);

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).send("Search error");
  }
});

app.post("/view", async (req, res) => {
  const { product_id, product_name } = req.body;
  try {
    await pool.query(
      `INSERT INTO product_views(product_id, product_name) VALUES ($1,$2)`,
      [product_id, product_name || ""],
    );
    res.json({ message: "View stored" });
  } catch (err) {
    res.status(500).send("View error");
  }
});

app.delete("/product/:id", async (req, res) => {
  try {
    await pool.query("UPDATE products SET is_active=false WHERE id=$1", [
      req.params.id,
    ]);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).send("Delete error");
  }
});

app.post("/product/:id", async (req, res) => {
  const {
    title,
    description,
    category,
    price,
    discount_percentage,
    rating,
    stock,
    brand,
  } = req.body;
  const id = req.params.id;

  try {
    const result = await pool.query(
      `UPDATE products
       SET title=$1,
           description=$2,
           category=$3,
           price=$4,
           discount_percentage=$5,
           rating=$6,
           stock=$7,
           brand=$8
       WHERE id=$9 AND is_active=true`,
      [
        title,
        description,
        category,
        price,
        discount_percentage,
        rating,
        stock,
        brand,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Product not found or inactive" });
    }

    res.json({ message: "Product updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Update error");
  }
});

app.get("/get_categories", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT category FROM products WHERE is_active=true ORDER BY category",
    );

    const categories = result.rows.map((row) => row.category);

    res.json({ categories });
  } catch (err) {
    console.error("Category fetch error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(5000, async () => {
  console.log("Server running on port 5000");
  await connectProducer();
});