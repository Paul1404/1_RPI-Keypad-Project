/**
 * Event listener for the DOMContentLoaded event.
 * Initializes the form submit event listener.
 */
document.addEventListener("DOMContentLoaded", function() {
  // Define constants for messages
  const LOGIN_SUCCESSFUL = 'Login successful';
  const INVALID_CREDENTIALS = 'Invalid credentials';

  const form = document.getElementById('adminLoginForm');

  /**
   * Event listener for the form submit event.
   * Authenticates the admin and redirects on success.
   * @param {Event} event - The DOM event object
   */
  form.addEventListener('submit', async function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const data = await loginUser(username, password);

      if (data.message === LOGIN_SUCCESSFUL) {
        redirectToAdminDashboard();
      } else {
        showAlert(INVALID_CREDENTIALS);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });
});

/**
 * Asynchronously login the admin user.
 * @async
 * @param {string} username - The admin username
 * @param {string} password - The admin password
 * @returns {Promise<Object>} The server response as a JSON object
 */
async function loginUser(username, password) {
  const response = await fetch('/admin-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`Network response was not ok: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Redirects the user to the admin dashboard.
 */
function redirectToAdminDashboard() {
  window.location.href = '/admin_dashboard';
}

/**
 * Shows an alert with a specified message.
 * @param {string} message - The message to display
 */
function showAlert(message) {
  alert(message);
}