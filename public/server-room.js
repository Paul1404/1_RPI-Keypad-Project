const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * Serve the server-room.html page if the user is authenticated.
 * This endpoint checks if the user is authenticated by looking at the `isAuthenticated` property of the session.
 * If the user is authenticated, it sends the server-room.html file.
 * If the user is not authenticated, it redirects the user to the login page.
 * @param {Request} req - The Express request object. The `isAuthenticated` property of the session is attached to this object.
 * @param {Response} res - The Express response object. This is used to send the server-room.html file or redirect the user to the login page.
 */
router.get('/', (req, res) => {
    if (req.session && req.session.isAuthenticated) {
      res.sendFile(path.join(__dirname, 'public', 'server-room.html'));
    } else {
      res.redirect('/index.html');
    }
  });

module.exports = router;