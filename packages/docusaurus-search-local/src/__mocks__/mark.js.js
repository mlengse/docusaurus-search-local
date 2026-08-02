class Mark {
  constructor(root) {
    this.root = root;
    this.markedTerms = null;
    this.markedOptions = null;
    this.unmarked = false;
    this.unmarkOptions = null;
    Mark.instances.push(this);
  }

  mark(terms, options) {
    this.markedTerms = terms;
    this.markedOptions = options;
  }

  unmark(options) {
    this.unmarked = true;
    this.unmarkOptions = options;
  }
}

Mark.instances = [];

module.exports = Mark;
