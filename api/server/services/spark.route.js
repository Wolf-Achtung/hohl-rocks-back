// api/server/services/spark.route.js
const { getTodaySpark } = require('./spark');

function register(app){
  app.get('/api/spark/today', async (req, res) => {
    if (process.env.SPARK_ENABLE !== 'true') return res.status(404).json({ error: 'Spark disabled' });
    const rec = await getTodaySpark(false);
    const inm = req.headers['if-none-match'];
    if (inm && inm === rec.etag) return res.status(304).end();
    res.setHeader('ETag', rec.etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(rec.item);
  });
}

module.exports = { register };
