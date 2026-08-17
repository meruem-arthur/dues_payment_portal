const bcrypt = require("bcryptjs");
const password = "Bond442@love1"; // <-- your real password here
bcrypt.hash(password, 10).then(console.log);