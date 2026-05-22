import { msg } from "@lit/localize";

export function weekdayNarrowLabels(): string[] {
  return [
    msg("D", { id: "weekday.sun.narrow" }),
    msg("L", { id: "weekday.mon.narrow" }),
    msg("M", { id: "weekday.tue.narrow" }),
    msg("Mi", { id: "weekday.wed.narrow" }),
    msg("J", { id: "weekday.thu.narrow" }),
    msg("V", { id: "weekday.fri.narrow" }),
    msg("S", { id: "weekday.sat.narrow" }),
  ];
}
