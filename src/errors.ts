// Thrown by config.ts::getActiveProfile when no profile is configured or the
// named profile doesn't exist — distinct from FrappeRequestError (HTTP-layer)
// so cli.ts can map both to exit code 4 (ADR-022).
export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}
