document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById('adminLoginForm');
  
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    fetch('/admin-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.message === 'Login successful') {
        // No need to store token in localStorage
        // Session ID will be sent automatically in cookies

        // Redirect to admin dashboard
        window.location.href = '/admin_dashboard';
      } else {
        alert('Invalid credentials');
      }
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  });
});
