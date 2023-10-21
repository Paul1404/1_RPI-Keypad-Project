document.addEventListener("DOMContentLoaded", function () {
  // Check for JWT token
  const token = localStorage.getItem("jwtToken");
  if (!token) {
    // Redirect to login page if no token found
    window.location.href = "/admin.html";
    return;
  }

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