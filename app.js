const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const rateLimit = require("express-rate-limit");
const path = require('path');
const app = express();
const port = 3000;
const saltRounds = 10;

// Initialize session middleware
app.use(session({
  secret: 'your_secret_key_here',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Use secure: true in production
}));

let db = new sqlite3.Database('./AccessControl.db', (err) => {
  if (err) {
    console.error(`[ERROR] ${err.message}`);
    return;
  }
  console.log('[INFO] Connected to the SQLite database.');
});

// Initialize tables
const tableInitQueries = [
  'CREATE TABLE IF NOT EXISTS admin_users (username TEXT, password TEXT)',
  'CREATE TABLE IF NOT EXISTS valid_pins (pin TEXT)'
];

tableInitQueries.forEach(query => {
  db.run(query, (err) => {
    if (err) console.error(`[ERROR] ${err.message}`);
  });
});

// Create a default admin if command line arguments are provided
const [defaultAdminUsername, defaultAdminPassword] = process.argv.slice(2);
if (defaultAdminUsername && defaultAdminPassword) {
  bcrypt.hash(defaultAdminPassword, saltRounds, (err, hash) => {
    if (err) {
      console.error(`[ERROR] ${err.message}`);
      return;
    }
    const query = 'INSERT OR IGNORE INTO admin_users(username, password) VALUES(?, ?)';
    db.run(query, [defaultAdminUsername, hash], (err) => {
      if (err) {
        console.error(`[ERROR] Could not add default admin: ${err.message}`);
        return;
      }
      console.log(`[INFO] Default admin added successfully, username: ${defaultAdminUsername}`);
    });
  });
}

app.use(express.json());
app.use(express.static('public'));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

app.post('/admin-login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 4 || password.length < 6) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const query = 'SELECT username, password FROM admin_users WHERE username = ?';
  db.get(query, [username], (err, row) => {
    if (err || !row) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    bcrypt.compare(password, row.password, (err, match) => {
      if (match) {
        req.session.username = username;
        return res.json({ message: 'Login successful' });
      } else {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    });
  });
});

app.get('/admin_dashboard', (req, res) => {
  if (req.session.username) {
    res.sendFile(path.join(__dirname, 'secure/admin_dashboard.html'));
  } else {
    res.status(401).json({ message: 'Please log in' });
  }
});

app.post('/keypad-input', (req, res) => {
  const { pin } = req.body;

  const query = 'SELECT pin FROM valid_pins WHERE pin = ?';
  db.get(query, [pin], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    
    if (row) {
      return res.json({ message: 'PIN accepted' });
    } else {
      return res.json({ message: 'Invalid PIN' });
    }
  });
});

app.listen(port, () => {
  console.log(`[INFO] Server running at http://localhost:${port}/`);
  console.log('[INFO] You can add an admin user using: npm start -- [Username] [Password]');
});
