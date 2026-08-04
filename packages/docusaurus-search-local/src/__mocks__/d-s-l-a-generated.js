const mylunr = jest.fn(() => ({
  ref: jest.fn(),
  field: jest.fn(),
}));

mylunr.Index = { load: jest.fn() };

function tokenize(input) {
  return input.split(/\s+/);
}

module.exports = { mylunr, tokenize };
