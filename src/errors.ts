export class NoResponseError extends Error {
  constructor(...args: any[]) {
    super(...args)
    this.name = 'no-response'
  }
}
