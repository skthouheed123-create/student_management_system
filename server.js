
const express = require("express");
const mysql = require("mysql2");
const path = require("path");

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "crud_db"
});

// Connect to MySQL
db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err.message);
    } else {
        console.log("Connected to MySQL!");
    }
});

// Escape HTML
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
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

// Add User page
app.get("/add.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "add.html"));
});

// Create: Add User
app.post("/add", (req, res) => {
    const { name, email } = req.body;

    if (!name?.trim() || !email?.trim()) {
        return res.status(400).send("Name and email are required.");
    }

    const sql = "INSERT INTO users (name, email) VALUES (?, ?)";

    db.query(sql, [name.trim(), email.trim()], (err) => {
        if (err) {
            console.log(err.message);
            return res.status(500).send("Error adding user");
        }

        res.redirect("/users");
    });
});

// Read: Search and display only one user
app.get("/users", (req, res) => {
    const search = String(req.query.q || "").trim();

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Search Users</title>
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>Search Users</h1>
                <p>Find a user by name or email.</p>

                <form action="/users" method="GET">
                    <label>Search User</label>
                    <input
                        type="text"
                        name="q"
                        placeholder="Enter name or email"
                        value="${escapeHtml(search)}"
                        required
                    >
                    <button type="submit">Search</button>
                    <a href="/">Home</a>
                </form>
    `;

    if (!search) {
        html += `
            <p>Enter a name or email to find a user.</p>
        `;
        return res.send(html + `
            </div>
        </div>
    </body>
    </html>
        `);
    }

    const sql = `
        SELECT * FROM users
        WHERE name LIKE ? OR email LIKE ?
        ORDER BY id
        LIMIT 1
    `;

    const term = `%${search}%`;

    db.query(sql, [term, term], (err, results) => {
        if (err) {
            console.log(err.message);
            return res.status(500).send("Error searching users");
        }

        if (results.length === 0) {
            html += `
                <h2>Search Result</h2>
                <p>No matching user found.</p>
            `;
        } else {
            const user = results[0];
            const id = encodeURIComponent(user.id);

            html += `
                <h2>Search Result</h2>
                <div class="table-wrapper">
                    <table>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Action</th>
                        </tr>
                        <tr>
                            <td>${escapeHtml(user.id)}</td>
                            <td>${escapeHtml(user.name)}</td>
                            <td>${escapeHtml(user.email)}</td>
                            <td>
                                <a href="/edit/${id}">Edit</a>

                                <form
                                    action="/delete/${id}"
                                    method="POST"
                                    onsubmit="return confirm('Are you sure you want to delete this user?');"
                                >
                                    <button type="submit">Delete</button>
                                </form>
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        }

        html += `
            </div>
        </div>
    </body>
    </html>
        `;

        res.send(html);
    });
});

// Update: Display edit form
app.get("/edit/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "SELECT * FROM users WHERE id = ?",
        [id],
        (err, results) => {
            if (err) {
                console.log(err.message);
                return res.status(500).send("Error fetching user");
            }

            if (results.length === 0) {
                return res.status(404).send("User not found");
            }

            const user = results[0];
            const safeId = encodeURIComponent(user.id);

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
                    <div class="container">
                        <div class="card">
                            <h1>Edit User</h1>
                            <p>Update the user's details.</p>

                            <form action="/update/${safeId}" method="POST">
                                <label>Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value="${escapeHtml(user.name)}"
                                    placeholder="Enter name"
                                    required
                                >

                                <label>Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    value="${escapeHtml(user.email)}"
                                    placeholder="Enter email"
                                    required
                                >

                                <button type="submit">Update User</button>
                                <a href="/users">Back</a>
                            </form>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    );
});

// Update: Save edited user
app.post("/update/:id", (req, res) => {
    const { name, email } = req.body;
    const id = req.params.id;

    if (!name?.trim() || !email?.trim()) {
        return res.status(400).send("Name and email are required.");
    }

    const sql = `
        UPDATE users
        SET name = ?, email = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [name.trim(), email.trim(), id],
        (err, result) => {
            if (err) {
                console.log(err.message);
                return res.status(500).send("Error updating user");
            }

            if (result.affectedRows === 0) {
                return res.status(404).send("User not found");
            }

            res.redirect("/users");
        }
    );
});

// Delete: Remove user
app.post("/delete/:id", (req, res) => {
    const id = req.params.id;

    const sql = "DELETE FROM users WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.log(err.message);
            return res.status(500).send("Error deleting user");
        }

        if (result.affectedRows === 0) {
            return res.status(404).send("User not found");
        }

        res.redirect("/users");
    });
});

// Start server
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});