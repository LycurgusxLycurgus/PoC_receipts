export type ErrorBody = {
  status: "error";
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  statusCode: number;
  code: string;
  details: Record<string, unknown> | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(error: unknown): ErrorBody {
  if (error instanceof AppError) {
    const body: ErrorBody = {
      status: "error",
      code: error.code,
      message: error.message
    };
    if (error.details) {
      body.details = error.details;
    }
    return body;
  }

  return {
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Internal server error"
  };
}
