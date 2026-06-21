// scripts/createAdmin.js

const bcrypt = require("bcrypt");

(async () => {
  const hash = await bcrypt.hash("admin@123", 10);

  console.log(hash);
})();
