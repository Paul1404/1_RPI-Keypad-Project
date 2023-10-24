document.addEventListener("DOMContentLoaded", function() {
  // Define constants for messages
  const LOGIN_SUCCESSFUL = 'Login successful';
  const INVALID_CREDENTIALS = 'Invalid credentials';
  
  const form = document.getElementById('adminLoginForm');
  
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

function redirectToAdminDashboard() {
  window.location.href = '/admin_dashboard';
}

function showAlert(message) {
  alert(message);
}
