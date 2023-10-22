document.addEventListener("DOMContentLoaded", function () {
  // Check for JWT token
  const token = localStorage.getItem("token");
  console.log("Retrieved token from storage:", token);
  if (!token) {
    // Redirect to login page if no token found
    window.location.href = "/admin.html";
    return;
  }

  // Fetch admin dashboard content upon page load
  fetch('/admin_dashboard', {
    headers: {
      'Authorization': token
    }
  })
  .then(response => {
    if (response.status === 401) {
      // Handle unauthorized access, possibly redirect to login page
      window.location.href = "/admin.html";
      return;
    }
    return response.json();
  })
  .then(data => {
    if (data) {
      // Populate the admin dashboard using the received data
      // This part depends on how you'd like to display the data
    }
  })
  .catch((error) => {
    console.error('Error:', error);
  });

  // Existing logic for adding PIN
  const form = document.getElementById("addPinForm");
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const newPin = document.getElementById("newPin").value;

    fetch("/add-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token // Add token to request header
      },
      body: JSON.stringify({ pin: newPin }),
    })
    .then((response) => response.json())
    .then((data) => {
      if (data.message === "PIN added successfully") {
        alert("PIN added successfully");
      } else {
        alert("Failed to add PIN");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  });
});
