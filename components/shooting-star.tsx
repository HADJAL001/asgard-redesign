"use client"

/* ================================================================
   ShootingStar — метеоритный дождь: 5 падающих звёзд разной яркости,
   скорости и угла (см. .shooting-star--a..e в globals.css), летят
   вразнобой поверх WorkshopBackdrop (который добавляет aurora-слой).
   ================================================================ */

export function ShootingStar() {
  return (
    <div className="shooting-star-root" aria-hidden="true">
      <span className="shooting-star shooting-star--a" />
      <span className="shooting-star shooting-star--b" />
      <span className="shooting-star shooting-star--c" />
      <span className="shooting-star shooting-star--d" />
      <span className="shooting-star shooting-star--e" />
    </div>
  )
}
