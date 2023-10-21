const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require("express-rate-limit");
const path = require('path'); // Make sure to add this import if not already present
const app = express();
const port = 3000;
const saltRounds = 10;
const secretKey = "your_secret_key_here";  // Make sure to store this securely

// Read command line arguments for default admin
const args = process.argv.slice(2);
const defaultAdminUsername = args[0] || null;
const defaultAdminPassword = args[1] || null;

let db = new sqlite3.Database('./AccessControl.db', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('[INFO] Connected to the SQLite database.');
});

db.run('CREATE TABLE IF NOT EXISTS admin_users (username TEXT, password TEXT)', (err) => {
  if (err) {
    return console.log(err.message);
  }
});

// Add default admin if command line arguments are provided
if (defaultAdminUsername && defaultAdminPassword) {
  bcrypt.hash(defaultAdminPassword, saltRounds, function(err, hash) {
    db.run('INSERT OR IGNORE INTO admin_users(username, password) VALUES(?, ?)', [defaultAdminUsername, hash], function(err) {
      if (err) {
        return console.log('Could not add default admin', err.message);
      }
      console.log('Default admin added successfully, username: ', defaultAdminUsername);
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

  db.get('SELECT username, password FROM admin_users WHERE username = ?', [username], (err, row) => {
    if (row) {
      bcrypt.compare(password, row.password, function(err, result) {
        if (result) {
          const token = jwt.sign({ username: row.username }, secretKey, {
            expiresIn: "1h"
          });
          return res.json({ message: 'Login successful', token });
        } else {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      });
    } else {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
  });
});

app.get('/admin_dashboard', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
    res.sendFile(path.join(__dirname, 'secure/admin_dashboard.html'));
  });
});


app.listen(port, () => {
  console.log(`[INFO] Server running at http://localhost:${port}/`);
  console.log('[INFO] You can add add a admin user using: npm start -- [Username] [Password]');
});