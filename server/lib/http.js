export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// Interrompe a função com uma mensagem amigável para o usuário (equivalente ao Notify de erro do Power Apps).
export const falha = (message, status = 400) => {
  throw new HttpError(status, message);
};

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
