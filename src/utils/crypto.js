const crypto = require("crypto");

const createString = () => {
  return crypto.randomBytes(60).toString("hex");
};

module.exports = {
  createString,
};
