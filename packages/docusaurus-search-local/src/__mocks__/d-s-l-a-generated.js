const lunr = require("lunr");

const mylunr = lunr;

function tokenize(input) {
  return lunr
    .tokenizer(input)
    .map((token) => token.str);
}

module.exports = { mylunr, tokenize };
