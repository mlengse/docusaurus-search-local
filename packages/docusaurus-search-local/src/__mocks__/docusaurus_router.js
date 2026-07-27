module.exports = {
  useLocation: jest.fn(() => ({ state: null, pathname: "/" })),
  useHistory: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
};
