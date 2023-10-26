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
let db;

const port = process.env.PORT || 3000;
const secretKey = process.env.SECRET_KEY;
const saltRounds = parseInt(process.env.SALT_ROUNDS, 10);
const logDir = 'logs';

function initializeLogger() {
  // Create the logs directory if it does not exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  // Limit lines to 100 for each log file
  ['error.log', 'combined.log'].forEach((logFile) => {
    const filePath = `${logDir}/${logFile}`;
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      if (lines.length >= 100) {
        fs.writeFileSync(filePath, lines.slice(lines.length - 100).join('\n') + '\n');
      }
    }
  });

  // Formatting
  const humanReadableFormat = winston.format.printf(({ level, message, label, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    if (Object.keys(metadata).length > 0) {
      msg += JSON.stringify(metadata);
    }
    return msg;
  });

  // Logger configuration
  const logger = winston.createLogger({
    level: 'info',
    transports: [
      new winston.transports.File({
        filename: `${logDir}/error.log`,
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            humanReadableFormat
        )
      }),
      new winston.transports.File({
        filename: `${logDir}/combined.log`,
        format: winston.format.combine(
            winston.format.timestamp(),
            humanReadableFormat
        )
      }),
      new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            humanReadableFormat
        )
      })
    ]
  });

  // Test logging
  logger.info('Test-Information message', { meta: 'some meta data' });
  logger.error('Test-Error message', { error: 'an error occurred' });

  return logger;
}


// Initialize logger
const logger = initializeLogger();


// Initialize session middleware
app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Use secure: true in production!!!
}));

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database('./AccessControl.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {  // Removed 'const'
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

  app.post('/add-pin', async (req, res) => {
    const { pin } = req.body;

    try {
      // Hash the PIN
      const hashedPin = await bcrypt.hash(pin, saltRounds);

      // Insert the hashed PIN into the database
      const query = 'INSERT INTO valid_pins(pin) VALUES(?)';
      db.run(query, [hashedPin], (err) => {
        if (err) {
          logger.error(`Failed to add PIN`, {
            error_message: err.message,
            action: 'add_pin',
            status: 'failure'
          });
          return res.status(500).json({ message: 'Internal Server Error' });
        }
        logger.info(`Successfully added PIN`, {
          pin: hashedPin,  // Log the hashed PIN, not the original
          action: 'add_pin',
          status: 'success'
        });
        res.json({ message: 'PIN added successfully' });
      });
    } catch (error) {
      logger.error(`Failed to hash PIN`, {
        error_message: error.message,
        action: 'hash_pin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }
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


  app.post('/keypad-input', async (req, res) => {
    const { pin } = req.body;

    logger.info('Received PIN:', pin);  // Debugging line

    // Fetch all hashed PINs or the specific one based on some other criterion, e.g., user ID
    const query = 'SELECT pin FROM valid_pins';
    db.all(query, [], async (err, rows) => {
      if (err) {
        logger.error('Database Error:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      logger.info('Fetched rows:', rows);  // Debugging line

      // Loop through each hashed PIN to see if it matches
      for (const row of rows) {
        try {
          const isValidPin = await bcrypt.compare(pin, row.pin);

          logger.info(`Comparing entered PIN ${pin} with stored PIN ${row.pin}:`, isValidPin);  // Debugging line

          if (isValidPin) {
            logger.info('Valid PIN. Redirecting...');  // Debugging line
            return res.json({ success: true });
          }
        } catch (error) {
          logger.error('Bcrypt Error:', error);
          return res.status(500).json({ message: 'Internal Server Error' });
        }
      }

      // If loop finishes, and we haven't returned yet, then the PIN was invalid
      logger.info('Invalid PIN. Not Redirecting...');  // Debugging line
      return res.json({ message: 'Invalid PIN' });
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


async function handleShutdown() {
    try {
        logger.info('Application is shutting down', {
            action: 'shutdown',
            status: 'info'
        });

        // Cleanup code: Close the SQLite database connection
        await new Promise((resolve, reject) => {
            logger.info('Attempting to close database...');
            db.close((err) => {
                if (err) {
                    logger.error(`Failed to close the database`, {
                        error_message: err.message,
                        action: 'db_close',
                        status: 'failure'
                    });
                    return reject(err);
                }

                logger.info(`Database closed successfully`, {
                    action: 'db_close',
                    status: 'success'
                });

                resolve();
            });
        });
    } catch (err) {
        logger.error('An error occurred during shutdown', {
            error_message: err.message,
            action: 'shutdown',
            status: 'failure'
        });
    } finally {
        // Delay the exit by 2 seconds to allow logger to complete
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }
}


process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', async (key) => {
  // Custom exit sequence: Ctrl+X
  if (key.toString() === '\u0018') {
    logger.info('Caught (CTRL+X) Sequence. Shutting down...');
    await handleShutdown();
    process.exit(0);
  }
});
