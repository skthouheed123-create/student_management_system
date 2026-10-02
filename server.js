
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Database connection
let db;

async function connectDatabase() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log("Connected to Aiven MySQL!");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
}

// Escape HTML
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Add user page
app.get("/add.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "add.html"));
});

// Add user
app.post("/add", async (req, res) => {
  const { name, email } = req.body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    !name.trim() ||
    !email.trim()
  ) {
    return res.status(400).send("Name and email are required.");
  }

  try {
    await db.execute(
      "INSERT INTO users (name, email) VALUES (?, ?)",
      [name.trim(), email.trim()]
    );

    res.redirect("/users");
  } catch (err) {
    console.error("Add error:", err.message);
    res.status(500).send("Unable to add user.");
  }
});

// Search users (no users shown until searching)
app.get("/users", async (req, res) => {
  const search = String(req.query.q || "").trim();

  try {
    let users = [];

    // Search only when the user enters a value
    if (search) {
      const keyword = `%${search}%`;

      const [results] = await db.execute(
        `SELECT id, name, email
         FROM users
         WHERE name LIKE ? OR email LIKE ?
         ORDER BY id DESC`,
        [keyword, keyword]
      );

      users = results;
    }

    // Display matching users
    const rows = users.map((user) => `
      <tr>
        <td>${user.id}</td>
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>
          <a href="/edit/${user.id}">Edit</a>
          <form action="/delete/${user.id}"
                method="POST"
                style="display:inline"
                onsubmit="return confirm('Delete this user?')">
            <button type="submit">Delete</button>
          </form>
        </td>
      </tr>
    `).join("");

    // Messages
    let message = "";

    if (!search) {
      message = "Enter a name or email to search for users.";
    } else if (users.length === 0) {
      message = "No matching users found.";
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport"
              content="width=device-width, initial-scale=1">
        <title>Users</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <h1>Users</h1>

        <form action="/users" method="GET">
          <input
            type="text"
            name="q"
            placeholder="Search name or email"
            value="${escapeHtml(search)}"
          >
          <button type="submit">Search</button>
          <a href="/users">Clear</a>
        </form>

        <p>
          <a href="/">Home</a> |
          <a href="/add.html">Add User</a>
        </p>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>NAME</th>
              <th>EMAIL</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr><td colspan="4">${message}</td></tr>`
            }
          </tbody>
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).send("Unable to search users.");
  }
});

// Edit user page
app.get("/edit/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).send("Invalid user ID.");
  }

  try {
    const [users] = await db.execute(
      "SELECT id, name, email FROM users WHERE id = ?",
      [id]
    );

    if (users.length === 0) {
      return res.status(404).send("User not found.");
    }

    const user = users[0];

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport"
              content="width=device-width, initial-scale=1">
        <title>Edit User</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <h1>Edit User</h1>

        <form action="/update/${id}" method="POST">
          <label for="name">Name</label>
          <input
            id="name"
            type="text"
            name="name"
            required
            maxlength="100"
            value="${escapeHtml(user.name)}"
          >

          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            required
            maxlength="254"
            value="${escapeHtml(user.email)}"
          >

          <button type="submit">Update User</button>
        </form>

        <p><a href="/users">Back to Users</a></p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Edit error:", err.message);
    res.status(500).send("Unable to fetch user.");
  }
});

// Update user
app.post("/update/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, email } = req.body;

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).send("Invalid user ID.");
  }

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    !name.trim() ||
    !email.trim()
  ) {
    return res.status(400).send("Name and email are required.");
  }

  try {
    const [result] = await db.execute(
      "UPDATE users SET name = ?, email = ? WHERE id = ?",
      [name.trim(), email.trim(), id]
    );

    if (result.affectedRows === 0) {
      const [users] = await db.execute(
        "SELECT id FROM users WHERE id = ?",
        [id]
      );

      if (users.length === 0) {
        return res.status(404).send("User not found.");
      }
    }

    res.redirect("/users");
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).send("Unable to update user.");
  }
});

// Delete user
app.post("/delete/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).send("Invalid user ID.");
  }

  try {
    const [result] = await db.execute(
      "DELETE FROM users WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("User not found.");
    }

    res.redirect("/users");
  } catch (err) {
    console.error("Delete error:", err.message);
    res.status(500).send("Unable to delete user.");
  }
});

// Start server after database connection
const PORT = process.env.PORT || 3000;

connectDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});