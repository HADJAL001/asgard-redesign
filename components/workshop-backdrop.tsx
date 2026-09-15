"use client"

/* ================================================================
   WorkshopBackdrop — кинематографичный космический фон для
   Оркестратора и Мастерской проекта (Workspace).
   ----------------------------------------------------------------
   Тот же приём, что и AmbientBackdrop (components/ambient-backdrop.tsx):
   презентационный слой, pointer-events:none, aria-hidden, рисуется
   ПОД контентом (родитель — `.eg-page` уже `position: relative`, этот
   слой — `position: absolute; inset: 0; z-index: 0`, а <main> внутри
   несёт `relative z-10`).

   Кадр — чистый CSS: глубокий тёмный градиент + туманность (радиальные
   градиенты в фирменных тонах OSGARD) + статичное звёздное поле,
   поверх — медленный Ken Burns zoom, зерно (тот же --grain SVG, что у
   .premium-card/.auth-vault), виньетка и затемнение снизу под текст.
   Падающие звёзды — отдельный компонент ShootingStar.
   ================================================================ */

export function WorkshopBackdrop() {
  return (
    <div className="workshop-backdrop" aria-hidden="true">
      <div className="workshop-backdrop-image" />
      <div className="workshop-backdrop-aurora" />
      <div className="workshop-backdrop-stars" />
      <div className="workshop-backdrop-grain" />
      <div className="workshop-backdrop-vignette" />
      <div className="workshop-backdrop-fade" />
    </div>
  )
}
