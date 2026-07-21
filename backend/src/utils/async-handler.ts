import type { NextFunction, Request, RequestHandler, Response } from "express"

/* ================================================================
   Express не ловит отклонённые промисы из async-роут-хендлеров сам —
   необработанное исключение внутри async(req,res)=>{...} становится
   unhandled promise rejection и (Node >=15, по умолчанию) валит весь
   процесс, а не только текущий запрос. Оборачивание в asyncHandler
   передаёт ошибку в next(err) → в express error-middleware.
   ================================================================ */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next)
  }
}
