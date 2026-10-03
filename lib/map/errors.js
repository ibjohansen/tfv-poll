export class MapError extends Error {
  constructor(code, status = 400, values = {}) {
    super(code);
    this.name = 'MapError';
    this.code = code;
    this.status = status;
    this.values = values;
  }
}
