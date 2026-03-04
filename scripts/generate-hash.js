const bcrypt = require('bcryptjs');

const pin = process.argv[2] || '1234';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(pin, salt);

console.log(`\nPIN: ${pin}`);
console.log(`Hash: ${hash}`);
console.log(`\nExample .env.local line:`);
console.log(`ADMIN_PIN_HASH="${hash}"\n`);
