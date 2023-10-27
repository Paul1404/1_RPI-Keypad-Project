/**
 * Event listener for DOMContentLoaded event.
 * Initializes the keypad and the admin login button.
 */
document.addEventListener("DOMContentLoaded", function() {
  initKeypad();
  document.getElementById('adminLoginButton').addEventListener('click', function() {
    window.location.href = 'admin_login.html';
  });
});

/** @type {string} Stores the PIN entered by the user. */
let pin = "";

/**
 * Initializes the keypad by adding buttons.
 */
function initKeypad() {
  const keypad = document.getElementById("keypad");
  for (let i = 1; i <= 9; i++) {
    addButton(keypad, i);
  }
  addButton(keypad, 'C', clearPin);
  addButton(keypad, 0);
  addButton(keypad, 'OK', submitPin);
}

/**
 * Adds a button to the keypad.
 * @param {HTMLElement} keypad - The keypad element.
 * @param {(number|string)} label - The label for the button.
 * @param {Function} [action=appendToPin] - The action to perform when the button is clicked.
 */
function addButton(keypad, label, action = appendToPin) {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = "keypad-button";
  button.addEventListener("click", function() {
    action(label);
  });
  keypad.appendChild(button);
}

/**
 * Appends a number to the PIN.
 * @param {number} number - The number to append.
 */
function appendToPin(number) {
  pin += number;
  document.getElementById("pinDisplay").textContent = pin;
}

/**
 * Clears the PIN.
 */
function clearPin() {
  pin = "";
  document.getElementById("pinDisplay").textContent = pin;
}

/**
 * Submits the PIN to the server.
 */
async function submitPin() {
  console.log("Sending PIN:", JSON.stringify({ pin: pin }));
  const response = await fetch('/keypad-input', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ pin: pin })
  });

  if (!response.ok) {
    alert(`Error: ${response.statusText}`);
    return;
  }

  const data = await response.json();

  if (data.success) {
    window.location.href = '/server-room.html';
  } else {
    alert(data.message);
  }

  clearPin();
}