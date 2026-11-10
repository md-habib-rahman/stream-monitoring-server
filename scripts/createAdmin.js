const bcrypt = require("bcryptjs");

const { Pool } = require("pg");
// const database_url =
//   "DATABASE_URL=postgresql://neondb_owner:npg_XQbufI3YnA1O@ep-orange-darkness-aoy5mlqj-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// const pool = new Pool({
//   connectionString: database_url,

//   connectionTimeoutMillis: 5000,
//   idleTimeoutMillis: 10000,
//   max: 10,
// });

async function createAdmin() {
  const password = "81Uh.I8C";

  const hash = await bcrypt.hash(password, 10);

//   console.log(hash)

//   await pool.query(
//     `
//     INSERT INTO users
//     (
//       username,
//       password_hash
//     )
//     VALUES
//     (
//       $1,$2
//     )
//     `,
//     ["bankim", hash],
//   );

//   console.log("Admin created");

//   process.exit();
}

createAdmin();
