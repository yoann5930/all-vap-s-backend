export class EmailError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMAIL_DISABLED"
      | "EMAIL_NOT_CONFIGURED"
      | "INVALID_RECIPIENT"
      | "HEADER_INJECTION"
      | "SEND_FAILED"
      | "TEST_RECIPIENT_REQUIRED"
  ) {
    super(message);
    this.name = "EmailError";
  }
}
