const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const { authenticateToken, isAdmin, SECRET_KEY } = require('./middleware');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// AUTENTIFIKACIJOS ENDPOINT'AI
// ============================================

// Registracija
app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Vartotojo vardas ir slaptažodis yra privalomi' });
  }

  // Užšifruojame slaptažodį
  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = role || 'user'; // Pagal nutylėjimą - vartotojas

  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hashedPassword, userRole],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Toks vartotojo vardas jau egzistuoja' });
        }
        return res.status(500).json({ error: 'Klaida registruojant vartotoją' });
      }
      res.status(201).json({ 
        message: 'Vartotojas sėkmingai užregistruotas',
        userId: this.lastID 
      });
    }
  );
});

// Prisijungimas
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Vartotojo vardas ir slaptažodis yra privalomi' });
  }

  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Klaida ieškant vartotojo' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Neteisingas vartotojo vardas arba slaptažodis' });
      }

      // Tikriname slaptažodį
      const validPassword = await bcrypt.compare(password, user.password);
      
      if (!validPassword) {
        return res.status(401).json({ error: 'Neteisingas vartotojo vardas arba slaptažodis' });
      }

      // Sukuriame JWT token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Sėkmingai prisijungta',
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    }
  );
});

// ============================================
// DIENOS PIETŲ (MEALS) ENDPOINT'AI
// ============================================

// Gauti visus dienos pietus (viešas)
app.get('/api/meals', (req, res) => {
  const { date } = req.query;
  
  let query = 'SELECT * FROM meals WHERE available = 1';
  let params = [];
  
  if (date) {
    query += ' AND date = ?';
    params.push(date);
  }
  
  query += ' ORDER BY date DESC';
  
  db.all(query, params, (err, meals) => {
    if (err) {
      return res.status(500).json({ error: 'Klaida gaunant pietų sąrašą' });
    }
    res.json(meals);
  });
});

// Gauti konkretų pietų patiekalą
app.get('/api/meals/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM meals WHERE id = ?', [id], (err, meal) => {
    if (err) {
      return res.status(500).json({ error: 'Klaida gaunant pietų duomenis' });
    }
    if (!meal) {
      return res.status(404).json({ error: 'Pietūs nerasti' });
    }
    res.json(meal);
  });
});

// Pridėti naujus dienos pietus (tik admin)
app.post('/api/meals', authenticateToken, isAdmin, (req, res) => {
  const { name, description, price, date } = req.body;

  if (!name || !price || !date) {
    return res.status(400).json({ error: 'Pavadinimas, kaina ir data yra privalomi' });
  }

  db.run(
    'INSERT INTO meals (name, description, price, date) VALUES (?, ?, ?, ?)',
    [name, description, price, date],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Klaida pridedant pietus' });
      }
      res.status(201).json({
        message: 'Pietūs sėkmingai pridėti',
        mealId: this.lastID
      });
    }
  );
});

// Atnaujinti dienos pietus (tik admin)
app.put('/api/meals/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, price, date, available } = req.body;

  db.run(
    'UPDATE meals SET name = ?, description = ?, price = ?, date = ?, available = ? WHERE id = ?',
    [name, description, price, date, available !== undefined ? available : 1, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Klaida atnaujinant pietus' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Pietūs nerasti' });
      }
      res.json({ message: 'Pietūs sėkmingai atnaujinti' });
    }
  );
});

// Ištrinti dienos pietus (tik admin)
app.delete('/api/meals/:id', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM meals WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Klaida ištrinant pietus' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Pietūs nerasti' });
    }
    res.json({ message: 'Pietūs sėkmingai ištrinti' });
  });
});

// ============================================
// UŽSAKYMŲ (ORDERS) ENDPOINT'AI
// ============================================

// Sukurti naują užsakymą (autentifikuotas vartotojas)
app.post('/api/orders', authenticateToken, (req, res) => {
  const { meal_id, quantity } = req.body;
  const user_id = req.user.id;

  if (!meal_id || !quantity) {
    return res.status(400).json({ error: 'Pietų ID ir kiekis yra privalomi' });
  }

  // Patikriname ar pietūs egzistuoja ir gaunami jų kainą
  db.get('SELECT * FROM meals WHERE id = ? AND available = 1', [meal_id], (err, meal) => {
    if (err) {
      return res.status(500).json({ error: 'Klaida tikrinant pietus' });
    }
    if (!meal) {
      return res.status(404).json({ error: 'Pietūs nerasti arba nebeprieinami' });
    }

    const total_price = meal.price * quantity;

    db.run(
      'INSERT INTO orders (user_id, meal_id, quantity, total_price) VALUES (?, ?, ?, ?)',
      [user_id, meal_id, quantity, total_price],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Klaida kuriant užsakymą' });
        }
        res.status(201).json({
          message: 'Užsakymas sėkmingai sukurtas',
          orderId: this.lastID,
          total_price
        });
      }
    );
  });
});

// Gauti visus užsakymus (admin mato visus, vartotojas - tik savus)
app.get('/api/orders', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const isUserAdmin = req.user.role === 'admin';

  let query = `
    SELECT orders.*, meals.name as meal_name, meals.description as meal_description,
           users.username as user_name
    FROM orders 
    JOIN meals ON orders.meal_id = meals.id
    JOIN users ON orders.user_id = users.id
  `;

  let params = [];

  if (!isUserAdmin) {
    query += ' WHERE orders.user_id = ?';
    params.push(user_id);
  }

  query += ' ORDER BY orders.created_at DESC';

  db.all(query, params, (err, orders) => {
    if (err) {
      return res.status(500).json({ error: 'Klaida gaunant užsakymus' });
    }
    res.json(orders);
  });
});

// Atnaujinti užsakymo statusą (tik admin)
app.put('/api/orders/:id/status', authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Statusas yra privalomas' });
  }

  db.run(
    'UPDATE orders SET status = ? WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Klaida atnaujinant užsakymo statusą' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Užsakymas nerastas' });
      }
      res.json({ message: 'Užsakymo statusas sėkmingai atnaujintas' });
    }
  );
});

// ============================================
// ĮVERTINIMŲ (RATINGS) ENDPOINT'AI
// ============================================

// Pridėti įvertinimą (autentifikuotas vartotojas)
app.post('/api/ratings', authenticateToken, (req, res) => {
  const { meal_id, rating, comment } = req.body;
  const user_id = req.user.id;

  if (!meal_id || !rating) {
    return res.status(400).json({ error: 'Pietų ID ir įvertinimas yra privalomi' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Įvertinimas turi būti nuo 1 iki 5' });
  }

  db.run(
    'INSERT INTO ratings (user_id, meal_id, rating, comment) VALUES (?, ?, ?, ?)',
    [user_id, meal_id, rating, comment],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Klaida pridedant įvertinimą' });
      }
      res.status(201).json({
        message: 'Įvertinimas sėkmingai pridėtas',
        ratingId: this.lastID
      });
    }
  );
});

// Gauti pietų įvertinimus
app.get('/api/ratings/meal/:meal_id', (req, res) => {
  const { meal_id } = req.params;

  db.all(
    `SELECT ratings.*, users.username 
     FROM ratings 
     JOIN users ON ratings.user_id = users.id 
     WHERE ratings.meal_id = ? 
     ORDER BY ratings.created_at DESC`,
    [meal_id],
    (err, ratings) => {
      if (err) {
        return res.status(500).json({ error: 'Klaida gaunant įvertinimus' });
      }
      res.json(ratings);
    }
  );
});

// ============================================
// SERVERIO PALEIDIMAS
// ============================================

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  Serveris paleistas ant porto ${PORT}      ║`);
  console.log(`║  http://localhost:${PORT}                  ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
});

// Sukuriame pradinius duomenis (tik vieną kartą)
setTimeout(() => {
  // Tikriname ar yra admin vartotojo
  db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, user) => {
    if (!user) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        ['admin', hashedPassword, 'admin'],
        () => console.log('✓ Sukurtas admin vartotojas (username: admin, password: admin123)')
      );
    }
  });

  // Tikriname ar yra test vartotojo
  db.get('SELECT * FROM users WHERE username = ?', ['vartotojas'], async (err, user) => {
    if (!user) {
      const hashedPassword = await bcrypt.hash('test123', 10);
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        ['vartotojas', hashedPassword, 'user'],
        () => console.log('✓ Sukurtas test vartotojas (username: vartotojas, password: test123)')
      );
    }
  });

  // Pridedame pavyzdinius pietus
  const today = new Date().toISOString().split('T')[0];
  db.get('SELECT * FROM meals WHERE date = ?', [today], (err, meal) => {
    if (!meal) {
      db.run(
        'INSERT INTO meals (name, description, price, date) VALUES (?, ?, ?, ?)',
        ['Vištienos kepsniai su bulvytėmis', 'Traškūs vištienos kepsniai, virtos bulvės, daržovių salotai', 5.50, today],
        () => console.log('✓ Pridėti šiandienos pietūs')
      );
    }
  });
}, 1000);
