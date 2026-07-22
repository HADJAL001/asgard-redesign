export function temperatureLabel(t: number): string {
  if (t < 0.4) return "Точность"
  if (t <= 1.1) return "Баланс"
  return "Креативность"
}
