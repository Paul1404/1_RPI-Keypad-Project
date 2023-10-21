# 🚪 Access Control System

This is a simple Access Control System implemented in Node.js using Express, SQLite, and JSON Web Tokens (JWT). It allows authorized users to log in and access an admin dashboard.

## 🌟 Features

- 💻 User authentication using a username and password.
- 🛡️ Rate limiting for login attempts.
- 🔒 Secure storage of user credentials using bcrypt.
- 🔑 Token-based authentication and authorization using JWT.
- 🚀 Admin dashboard accessible to authenticated users.

## 🚀 Getting Started

Follow these instructions to set up and run the project locally.

### 📋 Prerequisites

- [Node.js](https://nodejs.org/) installed on your machine.
- Git installed (optional, for cloning the repository).

### 🚀 Installation

1. Clone the repository (if you haven't already):

   ```shell
   git clone https://github.com/your-username/access-control-system.git
   ```

2. Navigate to the project directory:
    
    ```shell
    cd access-control-system
    ```
    
3. Install project dependencies:
    
    ```shell
    npm install
    ```
    

### 🚀 Usage

1. Start the server:
    
    ```shell
    npm start
    ```
    
2. Access the application in your web browser at [http://localhost:3000](http://localhost:3000).
    
3. To add an admin user (for demonstration purposes), you can use the following command:
    
    ```shell
    npm start -- [Username] [Password]
    ```
    
    Replace `[Username]` and `[Password]` with the desired admin user credentials.
    

### 🔐 Authentication

* To access the admin dashboard, use the provided admin user credentials.
* Upon successful login, a JWT token will be generated and stored in your browser's local storage.

### 📁 Structure

* `app.js`: Main server file with authentication and routing logic.
* `public`: Publicly accessible folder for HTML and client-side JavaScript.
* `secure`: Secure folder for sensitive files (e.g., admin dashboard).
* `AccessControl.db`: SQLite database for storing user data.

### 🙌 Credits

This project was created by Paul as a demonstration of user authentication and access control in Node.js.

### 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
