export const DESTINATIONS = [
  {
    min: 0,
    name: "SKY",
    ja: "大空",
    rank: "C",
    distance: 3,
    travel: 0.24,
    color: "#a7deda",
  },
  {
    min: 1500,
    name: "STRATOSPHERE",
    ja: "成層圏",
    rank: "B",
    distance: 35,
    travel: 0.65,
    color: "#62cce0",
  },
  {
    min: 3000,
    name: "SPACE",
    ja: "宇宙空間",
    rank: "A",
    distance: 400,
    travel: 1.2,
    color: "#58dfdd",
  },
  {
    min: 5000,
    name: "MOON",
    ja: "月",
    rank: "A+",
    distance: 384400,
    travel: 2.1,
    color: "#d7decc",
  },
  {
    min: 7000,
    name: "MARS",
    ja: "火星",
    rank: "S",
    distance: 225000000,
    travel: 3.1,
    color: "#fa8a55",
  },
  {
    min: 8500,
    name: "JUPITER",
    ja: "木星",
    rank: "S+",
    distance: 778000000,
    travel: 4.1,
    color: "#dfb57b",
  },
  {
    min: 9500,
    name: "BEYOND SOLAR SYSTEM",
    ja: "太陽系突破",
    rank: "SS",
    distance: 18000000000,
    travel: 5.3,
    color: "#81e8d6",
  },
];
export function destination(power) {
  return (
    [...DESTINATIONS].reverse().find((d) => power >= d.min) || DESTINATIONS[0]
  );
}
export function flightFrame(power, time) {
  const target = destination(power),
    t = Math.min(10, Math.max(0, time));
  const progress = Math.max(0, Math.min(1, (t - 5) / 5));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    target,
    progress,
    travel: target.travel * eased,
    distance: Math.round(target.distance * eased),
    phase:
      t < 1
        ? "complete"
        : t < 2
          ? "transfer"
          : t < 5
            ? "countdown"
            : t < 5.7
              ? "ignition"
              : "flight",
    count: t >= 2 && t < 5 ? Math.ceil(5 - t) : null,
    transfer: Math.max(0, Math.min(1, (t - 1) / 1.5)),
  };
}
