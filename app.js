/**
 * Import required modules and packages.
 * @external express
 * @external sqlite3
 * @external bcrypt
 * @external session
 * @external rateLimit
 * @external path
 * @external util
 * @external winston
 * @external fs
 */

// Import required modules and packages
const express = require('express');              // Express.js for web server functionality
const sqlite3 = require('sqlite3').verbose();    // SQLite3 for database management
const bcrypt = require('bcrypt');                // bcrypt for password hashing
const session = require('express-session');      // express-session for session management
const rateLimit = require("express-rate-limit"); // Rate limiting to prevent abuse
const path = require('path');                    // Node.js path module for handling file and directory paths
const util = require('util');                    // Utility functions for debugging and logging
const app = express();                           // Create an instance of the Express application
const winston = require('winston');              // Winston for logging
const fs = require('fs');                        // Node.js file system module for file I/O


/**
 * Immediately invoke the `config` function from the `dotenv` package.
 * This loads environment variables from a .env file into `process.env`.
 */
require('dotenv').config();


/**
 * Initialize database connection variable.
 */
let db = null;

/**
 * Load configuration values from environment variables, or use default values.
 * @type {Object}
 * @property {number} port - Port to run the web server on; default is 3000.
 * @property {string} secretKey - Secret key for session management.
 * @property {number} saltRounds - Number of rounds for bcrypt hashing; converted to an integer.
 * @property {string} logDir - Directory to store log files.
 */
const port = process.env.PORT || 3000;
const secretKey = process.env.SECRET_KEY;
const saltRounds = parseInt(process.env.SALT_ROUNDS, 10);
const logDir = 'logs';



/**
 * Initializes the logging system using Winston.
 * It creates necessary log directories, limits log file sizes, and configures log formats.
 * @returns {winston.Logger} The configured Winston logger instance.
 */
function initializeLogger() {
  // Create the logs directory if it does not exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  // Limit the number of lines to 100 for each log file ('error.log' and 'combined.log')
  ['error.log', 'combined.log'].forEach((logFile) => {
    const filePath = `${logDir}/${logFile}`;
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      if (lines.length >= 100) {
        fs.writeFileSync(filePath, lines.slice(lines.length - 100).join('\n') + '\n');
      }
    }
  });

  // Define a custom log format
  const humanReadableFormat = winston.format.printf(({ level, message, label, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] : ${message} `;
    if (Object.keys(metadata).length > 0) {
      msg += JSON.stringify(metadata);
    }
    return msg;
  });

  // Configure the Winston logger
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

  // Log test messages to verify logger initialization
  logger.info('Test-Information message', { meta: 'some meta data' });
  logger.error('Test-Error message', { error: 'an error occurred' });

  // Return the configured logger
  return logger;
}


/**
 * The logger instance initialized by calling `initializeLogger`.
 * @type {winston.Logger}
 */
const logger = initializeLogger();


/**
 * Initialize session middleware with Express.
 * Note: In production, the cookie should be set to secure.
 */
app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Use secure: true in production!!!
}));


/**
 * Asynchronously initialize the SQLite database.
 * @async
 * @returns {Promise} A promise that resolves with the initialized SQLite database.
 */
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
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
 * Asynchronous setup function to initialize the database and tables.
 * Also creates a default admin user if command line arguments are provided.
 * @async
 * @returns {Promise} A promise that resolves with the initialized SQLite database.
 */
async function setup() {
  const db = await initializeDatabase();
  logger.info("Successfully initialized the database");

  // SQL queries to initialize tables
  const tableInitQueries = [
    'CREATE TABLE IF NOT EXISTS admin_users (username TEXT, password TEXT)',
    'CREATE TABLE IF NOT EXISTS valid_pins (pin TEXT)'
  ];

  // Execute each SQL query to initialize tables
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
 * Chain to the setup function to initialize additional middleware and settings.
 * If setup is successful, further middleware is initialized.
 */
setup().then(db => {
  // Make the SQLite get method Promisified
  util.promisify(db.get).bind(db);

  // Initialize JSON parser middleware with Express
  app.use(express.json());

  // Serve static files from the 'public' directory
  app.use(express.static('public'));


  /**
   * Initialize rate limiting middleware.
   * Limits requests to 5 every 15 minutes.
   */
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
  });


  /**
   * Handle POST requests for admin login.
   * Checks the credentials against the database after rate-limiting.
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */
  app.post('/admin-login', (req, res, next) => { // noinspection JSValidateTypes
    loginLimiter(req, res, next); }, (req, res) => {
    const { username, password } = req.body;

    // Validate username and password input
    if (!username || !password || username.length < 4 || password.length < 6) {
      return res.status(400).json({ message: "Invalid input" });
    }

    // SQL query to fetch admin details
    const query = 'SELECT username, password FROM admin_users WHERE username = ?';

    // Execute the query and handle result
    db.get(query, [username], (err, row) => {
      if (err || !row) {
        logger.error(`Invalid credentials provided`, {
          username,
          action: 'admin_login',
          status: 'failure'
        });
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Compare the hashed password
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


  /**
   * Serve the admin dashboard if the user is authenticated.
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */
  app.get('/admin_dashboard', (req, res) => {
    if (req.session.username) {
      res.sendFile(path.join(__dirname, 'public/admin_dashboard.html'));
    } else {
      res.status(401).sendFile(path.join(__dirname, 'public/unauthorized.html'));
    }
  });


  /**
   * Handle POST requests to add a new PIN.
   * The PIN is hashed before being stored in the database.
   * @param {Request} req - Express request object containing the PIN in the body
   * @param {Response} res - Express response object
   * @returns {Promise<void>}
   */
  app.post('/add-pin', async (req, res) => {
    const { pin } = req.body;

    try {
      // Hash the PIN
      const hashedPin = await bcrypt.hash(pin, saltRounds);

      // SQL query to insert the hashed PIN
      const query = 'INSERT INTO valid_pins(pin) VALUES(?)';

      // Execute the query and handle the result
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
          pin: hashedPin,  // Log the hashed PIN for security
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
   * Handle POST requests to remove a PIN.
   * The PIN is deleted from the database.
   * @param {Request} req - Express request object containing the PIN in the body
   * @param {Response} res - Express response object
   */
  app.post('/remove-pin', (req, res) => {
    const { pin } = req.body;

    // SQL query to delete the PIN
    const query = 'DELETE FROM valid_pins WHERE pin = ?';

    // Execute the query and handle the result
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
   * Handle POST requests to add a new admin.
   * The admins password is hashed before being stored in the database.
   * @param {Request} req - Express request object containing the admin username and password in the body
   * @param {Response} res - Express response object
   */
  app.post('/add-admin', (req, res) => {
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

      // SQL query to insert the new admin
      const query = 'INSERT INTO admin_users(username, password) VALUES(?, ?)';

      // Execute the query and handle result
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
   * Handle POST requests to remove an admin.
   * The admin is deleted from the database.
   * @param {Request} req - Express request object containing the admin username in the body
   * @param {Response} res - Express response object
   */
  app.post('/remove-admin', (req, res) => {
    const { username } = req.body;

    // SQL query to remove the admin
    const query = 'DELETE FROM admin_users WHERE username = ?';

    // Execute the query and handle result
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
   * Handle keypad input for PIN entry.
   * This endpoint receives a PIN as input and checks it against valid PINs stored in the database.
   * @async
   * @param {Object} req - The Express request object.
   * @param {Object} res - The Express response object.
   * @returns {Promise<JSON>} A promise that resolves with a JSON response indicating the success or failure of PIN validation.
   */
  app.post('/keypad-input', async (req, res) => {
    const { pin } = req.body;

    // SQL query to fetch all stored hashed PINs from the database
    const query = 'SELECT pin FROM valid_pins';
    db.all(query, [], async (err, rows) => {
      if (err) {
        logger.error('Database Error:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      // Loop through each fetched row to check if the entered PIN matches any stored hashed PIN
      for (const row of rows) {
        try {
          const isValidPin = await bcrypt.compare(pin, row.pin);

          if (isValidPin) {
            // Log a successful PIN match for debugging purposes
            logger.info('Valid PIN. Redirecting...');
            return res.json({ success: true });
          }
        } catch (error) {
          logger.error('Bcrypt Error:', error);
          return res.status(500).json({ message: 'Internal Server Error' });
        }
      }

      // If loop finishes and no return statement has been executed, then the entered PIN is invalid
      logger.info('Invalid PIN. Not Redirecting...');
      return res.json({ message: 'Invalid PIN' });
    });
  });


  /**
   * Start the Express web server.
   * Logs information about the server status and environment.
   */
  app.listen(port, () => {
    // Log that the server has started, along with the current environment and port
    logger.info(`Server started`, { environment: process.env.NODE_ENV, port });

    // Log the URL where the application can be accessed
    logger.info(`Navigate to http://localhost:${port}/ to access the application`);
  });

  /**
   * Catch-all error handler for database setup.
   * Logs an error if database setup fails.
   */
}).catch(err => {
  // Log that the database setup has failed, along with the error message and stack trace
  logger.error(`Failed to set up database`, {
    error_message: err.message,
    stack: err.stack
  });
});


/**
 * Asynchronously handle the application shutdown process.
 * This function closes the SQLite database connection and logs relevant information.
 * @async
 */
async function handleShutdown() {
  try {
    // Log that the application is beginning the shutdown process
    logger.info('Application is shutting down', {
      action: 'shutdown',
      status: 'info'
    });

    // Asynchronously close the SQLite database connection
    await new Promise((resolve, reject) => {
      logger.info('Attempting to close database...'); // Log the attempt to close the database

      db.close((err) => {
        if (err) {
          // Log failure to close the database
          logger.error(`Failed to close the database`, {
            error_message: err.message,
            action: 'db_close',
            status: 'failure'
          });
          return reject(err);
        }

        // Log successful database closure
        logger.info(`Database closed successfully`, {
          action: 'db_close',
          status: 'success'
        });

        resolve();
      });
    });
  } catch (err) {
    // Log any errors that occur during the shutdown process
    logger.error('An error occurred during shutdown', {
      error_message: err.message,
      action: 'shutdown',
      status: 'failure'
    });
  } finally {
    // Delay the process exit by 2 seconds to allow any remaining logging to complete
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }
}


/**
 * Set up custom exit sequences for the application.
 * This listens for specific key presses in the terminal to initiate a graceful shutdown.
 */
process.stdin.setRawMode(true);  // Enable raw mode for terminal input
process.stdin.resume();          // Resume stdin in the parent process

/**
 * Event listener for 'data' events on the standard input stream.
 * Captures key presses and checks for a custom exit sequence (Ctrl+X).
 * @async
 * @param {Buffer} key - The keypress captured as a Buffer object.
 */
process.stdin.on('data', async (key) => {
  // Check for custom exit sequence: Ctrl+X (represented by the '\u0018' Unicode character)
  if (key.toString() === '\u0018') {
    // Log that the custom exit sequence was captured
    logger.info('Caught (CTRL+X) Sequence. Shutting down...');

    // Call the handleShutdown function to perform cleanup operations
    await handleShutdown();

    // Exit the process with a 0 (success) status code
    process.exit(0);
  }
});