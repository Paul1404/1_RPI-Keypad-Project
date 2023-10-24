// noinspection JSValidateTypes

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const rateLimit = require("express-rate-limit");
const path = require('path');
const util = require('util');
const app = express();
require('dotenv').config();
const winston = require('winston');
const fs = require('fs');

const port = process.env.PORT || 3000;
const secretKey = process.env.SECRET_KEY;
const saltRounds = parseInt(process.env.SALT_ROUNDS, 10);
const logDir = 'logs';

const humanReadableFormat = winston.format.printf(({ level, message, label, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `
  if(metadata) {
    msg += JSON.stringify(metadata)
  }
  return msg
});

// Create the logs directory if it does not exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Configure Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});


// If we're not in production then also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      humanReadableFormat
    )
  }));
}
// Initialize session middleware
app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Use secure: true in production!!!
}));

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database('./AccessControl.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

async function setup() {
  const db = await initializeDatabase();
  logger.info("Successfully initialized the database");
  
  const tableInitQueries = [
    'CREATE TABLE IF NOT EXISTS admin_users (username TEXT, password TEXT)',
    'CREATE TABLE IF NOT EXISTS valid_pins (pin TEXT)'
  ];

  for (const query of tableInitQueries) {
    await db.run(query);
  }

  // Create a default admin if command line arguments are provided
  const [defaultAdminUsername, defaultAdminPassword] = process.argv.slice(2);
  if (defaultAdminUsername && defaultAdminPassword) {
    bcrypt.hash(defaultAdminPassword, saltRounds, (err, hash) => {
      if (err) {
        logger.error(`[ERROR] ${err.message}`);
        return;
      }
      const query = 'INSERT OR IGNORE INTO admin_users(username, password) VALUES(?, ?)';
      db.run(query, [defaultAdminUsername, hash], (err) => {
        if (err) {
          logger.error(`Failed to add default admin`, {
            error_message: err.message,
            action: 'create_default_admin',
            status: 'failure'
          });
          return;
        }
        logger.info(`Default admin added successfully`, {
          username: defaultAdminUsername,
          action: 'create_default_admin',
          status: 'success'
        });
      });
    });
  }

  return db;
}

setup().then(db => {
  util.promisify(db.get).bind(db);
  app.use(express.json());
  app.use(express.static('public'));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
  });

  app.post('/admin-login', (req, res, next) => { loginLimiter(req, res, next); }, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 4 || password.length < 6) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const query = 'SELECT username, password FROM admin_users WHERE username = ?';
  db.get(query, [username], (err, row) => {
    if (err || !row) {
      logger.error(`Invalid credentials provided`, {
        username,
        action: 'admin_login',
        status: 'failure'
      });
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
    res.sendFile(path.join(__dirname, 'public/admin_dashboard.html'));
  } else {
    res.status(401).sendFile(path.join(__dirname, 'public/unauthorized.html'));
  }
});

app.post('/add-pin', (req, res) => {
  const { pin } = req.body;
  const query = 'INSERT INTO valid_pins(pin) VALUES(?)';
  db.run(query, [pin], (err) => {
    if (err) {
      logger.error(`Failed to add PIN`, {
        error_message: err.message,
        action: 'add_pin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    logger.info(`Successfully added PIN`, {
      pin,
      action: 'add_pin',
      status: 'success'
    });
    res.json({ message: 'PIN added successfully' });
  });
});

app.post('/remove-pin', (req, res) => {
  const { pin } = req.body;
  const query = 'DELETE FROM valid_pins WHERE pin = ?';
  db.run(query, [pin], (err) => {
    if (err) {
      logger.error(`Failed to remove PIN`, {
        error_message: err.message,
        action: 'remove_pin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    logger.info(`Successfully removed PIN`, {
      pin,
      action: 'remove_pin',
      status: 'success'
    });
    res.json({ message: 'PIN removed successfully' });
  });
});

app.post('/add-admin', (req, res) => {
  const { username, password } = req.body;
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      logger.error(`Failed to hash password`, {
        error_message: err.message,
        action: 'add_admin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    const query = 'INSERT INTO admin_users(username, password) VALUES(?, ?)';
    db.run(query, [username, hash], (err) => {
      if (err) {
        logger.error(`Failed to add admin`, {
          error_message: err.message,
          action: 'add_admin',
          status: 'failure'
        });
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      logger.info(`Successfully added admin`, {
        username,
        action: 'add_admin',
        status: 'success'
      });
      res.json({ message: 'Admin added successfully' });
    });
  });
});

app.post('/remove-admin', (req, res) => {
  const { username } = req.body;
  const query = 'DELETE FROM admin_users WHERE username = ?';
  db.run(query, [username], (err) => {
    if (err) {
      logger.error(`Failed to remove admin`, {
        error_message: err.message,
        action: 'remove_admin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    logger.info(`Successfully removed admin`, {
      username,
      action: 'remove_admin',
      status: 'success'
    });
    res.json({ message: 'Admin removed successfully' });
  });
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
  logger.info(`Server started`, { environment: process.env.NODE_ENV, port });
  logger.info(`Navigate to http://localhost:${port}/ to access the application`);

});

}).catch(err => {
  logger.error(`Failed to set up database`, {
    error_message: err.message,
    stack: err.stack
  });
});