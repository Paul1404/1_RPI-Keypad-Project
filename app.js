// noinspection JSValidateTypes

/**
 * @fileoverview Main application entry point.
 */


// External Dependencies
const express = require('express');  // Express.js web framework
const sqlite3 = require('sqlite3').verbose();  // SQLite3 database driver with verbose logging
const bcrypt = require('bcrypt');  // Library for hashing passwords
const session = require('express-session');  // Session management library
const rateLimit = require("express-rate-limit");  // Rate limiting middleware
const path = require('path');  // Node.js path module for file and directory paths
const util = require('util');  // Utility functions for debugging
const winston = require('winston');  // Logging library
const fs = require('fs');  // File system module

// Internal Dependencies
require('dotenv').config();  // Load environment variables from .env file

// Global Variables
const app = express();  // Initialize Express app
let db;  // Database connection variable

// Environment variables and constants
const port = process.env.PORT || 3000;  // Application port
const secretKey = process.env.SECRET_KEY;  // Secret key for sessions
const saltRounds = parseInt(process.env.SALT_ROUNDS, 10);  // Salt rounds for bcrypt hashing
const logDir = 'logs';  // Directory for storing logs


/**
 * Initializes and configures the Winston logger.
 * 
 * This function performs the following tasks:
 * - Creates a 'logs' directory if it doesn't exist.
 * - Limits the log files to 100 lines each.
 * - Sets up the log format.
 * - Configures the log transports (file and console).
 *
 * @returns {Object} The configured Winston logger instance.
 */
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

  // Define log format
  const humanReadableFormat = winston.format.printf(({ level, message, label, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    if (Object.keys(metadata).length > 0) {
      msg += JSON.stringify(metadata);
    }
    return msg;
  });

  // Configure logger
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

/**
 * Initialize the Winston logger.
 * 
 * @type {Object}
 */
const logger = initializeLogger();



/**
 * Initializes the session middleware for the application.
 */
app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Use secure: true in production!!!
}));


/**
 * Initializes the SQLite database.
 *
 * @returns {Promise<Object>} A promise that resolves with the database instance or rejects with an error.
 */
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // Initialize SQLite database
    db = new sqlite3.Database('./AccessControl.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}


/**
 * Setup function to initialize the database, create tables, and add a default admin.
 *
 * @returns {Promise<Object>} A promise that resolves with the initialized database instance.
 */
async function setup() {
  // Initialize database
  const db = await initializeDatabase();
  logger.info("Successfully initialized the database");
  
  // SQL queries to initialize tables
  const tableInitQueries = [
    'CREATE TABLE IF NOT EXISTS admin_users (username TEXT, password TEXT)',
    'CREATE TABLE IF NOT EXISTS valid_pins (pin TEXT)'
  ];

  // Create tables
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


/**
 * Main setup routine.
 */
setup().then(db => {
  // Promisify database queries
  util.promisify(db.get).bind(db);

  // Enable JSON parsing
  app.use(express.json());

  // Serve static files
  app.use(express.static('public'));

  // Configure login rate limiter
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
  });
}).catch(err => {
  logger.error(`Failed to set up database`, {
    error_message: err.message,
    stack: err.stack
  });
});


/**
 * POST route for admin login.
 * Applies rate limiting using the 'loginLimiter' middleware and then handles the login logic.
 */
app.post('/admin-login', (req, res, next) => { loginLimiter(req, res, next); }, (req, res) => {
  // Extract username and password from request body
  const { username, password } = req.body;

  // Validate input length
  if (!username || !password || username.length < 4 || password.length < 6) {
    return res.status(400).json({ message: "Invalid input" });
  }

  // SQL query to fetch user
  const query = 'SELECT username, password FROM admin_users WHERE username = ?';
  
  // Execute query and handle response
  db.get(query, [username], (err, row) => {
    if (err || !row) {
      logger.error(`Invalid credentials provided`, {
        username,
        action: 'admin_login',
        status: 'failure'
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare hashed password
    bcrypt.compare(password, row.password, (err, match) => {
      if (match) {
        // Store username in session and send success response
        req.session.username = username;
        return res.json({ message: 'Login successful' });
      } else {
        // Send failure response
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    });
  });
});


/**
 * GET route for the admin dashboard.
 * Serves the admin dashboard HTML file if the user is authenticated.
 */
app.get('/admin_dashboard', (req, res) => {
  // Check for authenticated session
  if (req.session.username) {
    // Send admin dashboard HTML
    res.sendFile(path.join(__dirname, 'public/admin_dashboard.html'));
  } else {
    // Send unauthorized HTML
    res.status(401).sendFile(path.join(__dirname, 'public/unauthorized.html'));
  }
});


/**
 * POST route to add a new PIN.
 * Hashes the provided PIN and saves it to the database.
 */
app.post('/add-pin', async (req, res) => {
  // Extract PIN from request body
  const { pin } = req.body;

  try {
    // Hash the PIN using bcrypt
    const hashedPin = await bcrypt.hash(pin, saltRounds);

    // SQL query to insert hashed PIN
    const query = 'INSERT INTO valid_pins(pin) VALUES(?)';

    // Execute query and handle response
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


/**
 * POST route to remove an existing PIN.
 * Deletes the provided PIN from the database.
 */
app.post('/remove-pin', (req, res) => {
  // Extract PIN from request body
  const { pin } = req.body;

  // SQL query to delete PIN
  const query = 'DELETE FROM valid_pins WHERE pin = ?';

  // Execute query and handle response
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


/**
 * POST route to add a new admin user.
 * Hashes the provided password and saves the new admin to the database.
 */
app.post('/add-admin', (req, res) => {
  // Extract username and password from request body
  const { username, password } = req.body;

  // Hash the password using bcrypt
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      logger.error(`Failed to hash password`, {
        error_message: err.message,
        action: 'add_admin',
        status: 'failure'
      });
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    // SQL query to insert new admin
    const query = 'INSERT INTO admin_users(username, password) VALUES(?, ?)';

    // Execute query and handle response
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


/**
 * POST route to remove an existing admin user.
 * Deletes the provided username from the admin_users table in the database.
 */
app.post('/remove-admin', (req, res) => {
  // Extract username from request body
  const { username } = req.body;

  // SQL query to delete admin
  const query = 'DELETE FROM admin_users WHERE username = ?';

  // Execute query and handle response
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


/**
 * POST route to handle keypad PIN input.
 * Checks the provided PIN against a list of valid PINs stored in the database.
 */
app.post('/keypad-input', async (req, res) => {
  // Extract PIN from request body
  const { pin } = req.body;

  // SQL query to fetch all valid PINs
  const query = 'SELECT pin FROM valid_pins';

  // Execute query and handle response
  db.all(query, [], async (err, rows) => {
    if (err) {
      logger.error('Database Error:', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }

    // Compare entered PIN with each stored PIN
    for (const row of rows) {
      try {
        const isValidPin = await bcrypt.compare(pin, row.pin);
        if (isValidPin) {
          return res.redirect('/public/server-room.html');
        }
      } catch (error) {
        logger.error('Bcrypt Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
    }

    // If PIN is invalid
    return res.json({ message: 'Invalid PIN' });
  });
});


/**
 * Starts the Express server.
 * Listens for incoming connections on the specified port.
 */
app.listen(port, () => {
  logger.info(`Server started`, { environment: process.env.NODE_ENV, port });
  logger.info(`Navigate to http://localhost:${port}/ to access the application`);
});


/**
 * Gracefully shuts down the application.
 * Attempts to close the SQLite database connection and then terminates the process.
 */
async function handleShutdown() {
  try {
    logger.info('Application is shutting down', {
      action: 'shutdown',
      status: 'info'
    });

    // Attempt to close the SQLite database connection
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
    // Delay the process exit by 2 seconds to allow logger to complete
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