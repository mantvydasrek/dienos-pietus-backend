const jwt = require('jsonwebtoken');

const SECRET_KEY = 'tavo_slaptas_raktas_2024'; // Gamyboje naudok aplinkos kintamąjį!

// Middleware autentifikacijai
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Prieiga uždrausta. Reikalingas token.' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Neteisingas arba pasibaigęs token.' });
    }
    req.user = user;
    next();
  });
}

// Middleware administratoriaus rolei
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Prieiga tik administratoriams.' });
  }
  next();
}

module.exports = { authenticateToken, isAdmin, SECRET_KEY };
