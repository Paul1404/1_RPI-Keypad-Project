const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

let db = new sqlite3.Database('./pinCodes.db', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

db.run('CREATE TABLE IF NOT EXISTS pin_codes (pin TEXT)', (err) => {
  if (err) {
    return console.log(err.message);
  }
});

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/keypad-input', (req, res) => {
  const inputPin = req.body.pin;
  
  db.get('SELECT pin FROM pin_codes WHERE pin = ?', [inputPin], (err, row) => {
    if (err) {
      return console.error(err.message);
    }
    
    if (row) {
      res.json({ message: 'Door Unlocked' });
    } else {
      res.json({ message: 'Access Denied' });
    }
  });
});

app.post('/add-pin', (req, res) => {
  const newPin = req.body.pin;
  
  db.run('INSERT INTO pin_codes(pin) VALUES(?)', [newPin], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Could not add PIN', error: err.message });
    }
    res.status(201).json({ message: 'PIN added successfully', pin: newPin, id: this.lastID });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log('Database connection closed.');
  });
  process.exit(0);
});
