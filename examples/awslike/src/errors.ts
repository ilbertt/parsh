export class NotAuthorized extends Error {
  static readonly code = 'NotAuthorized' as const;
  constructor(identity: string) {
    super(`identity '${identity}' is not authorized for this operation`);
  }
}

export class InvalidRegion extends Error {
  static readonly code = 'InvalidRegion' as const;
  readonly region: string;
  constructor(region: string) {
    super(`region '${region}' is not a valid AWS region`);
    this.region = region;
  }
}
