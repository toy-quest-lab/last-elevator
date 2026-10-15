export type Art = {
  menu: HTMLImageElement | null;
  corridor: HTMLImageElement | null;
  doors: HTMLImageElement | null;
  panel: HTMLImageElement | null;
  ceiling: HTMLImageElement | null;
  ending: HTMLImageElement | null;
  endings: HTMLImageElement[];
  school: HTMLImageElement | null;
  chaseHall: HTMLImageElement | null;
  chasePack: HTMLImageElement | null;
  chaseNear: HTMLImageElement | null;
  chaseDoor: HTMLImageElement | null;
  chasePunched: HTMLImageElement | null;
  operator: HTMLImageElement[];
  zombie: HTMLImageElement[];
  hand: HTMLImageElement[];
  taxi: HTMLImageElement[];
  bust: HTMLImageElement | null;
  palms: HTMLImageElement | null;
};

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function loadArt(): Promise<Art> {
  return Promise.all([
    load("/game/menu.jpg?v=2"),
    load("/game/corridor.jpg"),
    load("/game/doors.jpg"),
    load("/game/panel-keys.png"),
    load("/game/ceiling.jpg"),
    load("/game/ending.jpg"),
    load("/game/end-home.jpg"),
    load("/game/end-child.jpg"),
    load("/game/end-meadow.jpg"),
    load("/game/end-island.jpg?v=5"),
    load("/game/end-dacha.jpg"),
    load("/game/school.jpg"),
    load("/game/chase-hall.jpg"),
    load("/game/chase-pack.jpg"),
    load("/game/chase-near.jpg"),
    load("/game/chase-door.jpg"),
    load("/game/chase-punched.jpg"),
    load("/game/op-1.png"),
    load("/game/op-2.png"),
    load("/game/op-3.png"),
    load("/game/op-4.png"),
    load("/game/zb-1.png"),
    load("/game/zb-2.png"),
    load("/game/zb-3.png"),
    load("/game/zb-4.png"),
    load("/game/hand-1.png"),
    load("/game/hand-2.png"),
    load("/game/hand-3.png"),
    load("/game/hand-4.png"),
    load("/game/taxi-1.png"),
    load("/game/taxi-2.png"),
    load("/game/taxi-4.png"),
    load("/game/taxi-3.png"),
    load("/game/palms.png"),
    load("/game/op-bust.png?v=1"),
  ]).then(([menu, corridor, doors, panel, ceiling, ending, home, child, meadow, island, dacha, school, hall, pack, near, door, punched, o1, o2, o3, o4, z1, z2, z3, z4, h1, h2, h3, h4, t1, t2, t4, t3, palms, bust]) => ({
    menu,
    corridor,
    doors,
    panel,
    ceiling,
    ending,
    endings: [ending, home, child, meadow, island, dacha].filter((x): x is HTMLImageElement => x !== null),
    school,
    chaseHall: hall,
    chasePack: pack,
    chaseNear: near,
    chaseDoor: door,
    chasePunched: punched,
    operator: [o1, o2, o3, o4].filter((x): x is HTMLImageElement => x !== null),
    zombie: [z1, z2, z3, z4].filter((x): x is HTMLImageElement => x !== null),
    hand: [h1, h2, h3, h4].filter((x): x is HTMLImageElement => x !== null),
    taxi: [t1, t2, t4, t3].filter((x): x is HTMLImageElement => x !== null),
    bust,
    palms,
  }));
}
