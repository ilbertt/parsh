export class NotAuthorized extends Error {
  constructor(identity: string) {
    super(`identity '${identity}' is not authorized for this operation`);
  }
}

export class InvalidRegion extends Error {
  readonly region: string;
  constructor(region: string) {
    super(`region '${region}' is not a valid AWS region`);
    this.region = region;
  }
}
