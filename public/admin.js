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
        console.log("Storing token:", data.token);
        localStorage.setItem('token', data.token);

        // Fetch admin dashboard content upon successful login
        fetch('/admin_dashboard', {
          headers: {
            'Authorization': data.token  // or 'Bearer ' + data.token if your backend expects "Bearer"
          }
        })
        .then(response => {
          if (response.status === 401) {
            // Handle unauthorized access, possibly redirect to login page
            window.location.href = "/admin_login.html";
          } else {
            // Redirect to admin dashboard
            window.location.href = '/admin_dashboard';
          }
        })
        .catch((error) => {
          console.error('Fetch Error:', error);
        });

      } else {
        alert('Invalid credentials');
      }
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  });
});
