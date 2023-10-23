document.addEventListener("DOMContentLoaded", function () {
  // Fetch admin dashboard content upon page load
  fetch('/admin_dashboard')
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
    }
  })
  .catch((error) => {
    console.error('Error:', error);
  });

  const form = document.getElementById("addPinForm");
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const newPin = document.getElementById("newPin").value;

    fetch("/add-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

const removePinForm = document.getElementById("removePinForm");
removePinForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const removePin = document.getElementById("removePin").value;

  fetch("/remove-pin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pin: removePin }),
  })
  .then((response) => response.json())
  .then((data) => {
    if (data.message === "PIN removed successfully") {
      alert("PIN removed successfully");
    } else {
      alert("Failed to remove PIN");
    }
  })
  .catch((error) => {
    console.error("Error:", error);
  });
});

const addAdminForm = document.getElementById("addAdminForm");
addAdminForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const adminUsername = document.getElementById("adminUsername").value;
  const adminPassword = document.getElementById("adminPassword").value;

  fetch("/add-admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  })
  .then((response) => response.json())
  .then((data) => {
    if (data.message === "Admin added successfully") {
      alert("Admin added successfully");
    } else {
      alert("Failed to add admin");
    }
  })
  .catch((error) => {
    console.error("Error:", error);
  });
});
