const bcrypt = require("bcryptjs");
const pool = require("../config/db");

async function createAdmin() {
  const password = "admin@123";

  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `
    INSERT INTO users
    (
      username,
      password_hash
    )
    VALUES
    (
      $1,$2
    )
    `,
    ["admin", hash],
  );

  console.log("Admin created");

  process.exit();
}

createAdmin();
