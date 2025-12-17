const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Sukuriame duomenų bazės kelią
const dbPath = path.join(__dirname, 'database.db');

// Sukuriame naują duomenų bazės objektą
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Klaida jungiantis prie duomenų bazės:', err);
  } else {
    console.log('Sėkmingai prisijungta prie SQLite duomenų bazės');
    initDatabase();
  }
});

// Inicializuojame duomenų bazės lenteles
function initDatabase() {
  // Vartotojų lentelė
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Dienos pietų lentelė
  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      date DATE NOT NULL,
      available BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Užsakymų lentelė
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (meal_id) REFERENCES meals(id)
    )
  `);

  // Įvertinimų lentelė
  db.run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (meal_id) REFERENCES meals(id)
    )
  `, (err) => {
    if (err) {
      console.error('Klaida kuriant lenteles:', err);
    } else {
      console.log('Visos lentelės sėkmingai sukurtos');
    }
  });
}

module.exports = db;
