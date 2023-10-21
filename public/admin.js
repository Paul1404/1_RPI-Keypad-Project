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
        // You can store the JWT token in localStorage or as a cookie for further use
        localStorage.setItem('token', data.token);
        // Redirect to admin dashboard
        window.location.href = 'admin_dashboard.html';
      } else {
        alert('Invalid credentials');
      }
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  });
});
