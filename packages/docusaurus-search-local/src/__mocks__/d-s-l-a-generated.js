const mylunr = jest.fn(() => ({
  ref: jest.fn(),
  field: jest.fn(),
}));

function tokenize(input) {
  return input.split(/\s+/);
}

module.exports = { mylunr, tokenize };
