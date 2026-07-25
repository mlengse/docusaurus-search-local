/**
 * @param {string} source
 * @returns {string}
 */
module.exports = function (source) {
  const options = this.getOptions();

  if (typeof options.generated !== "string") {
    throw new Error("options.generated is not a string");
  }
  return options.generated;
};
