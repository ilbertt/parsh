export class BlankNameError extends Error {
  constructor() {
    super('name cannot be blank or whitespace');
  }
}
