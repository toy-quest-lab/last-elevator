export type Art = {
  menu: HTMLImageElement | null;
  corridor: HTMLImageElement | null;
  doors: HTMLImageElement | null;
  panel: HTMLImageElement | null;
  ceiling: HTMLImageElement | null;
  ending: HTMLImageElement | null;
  endings: HTMLImageElement[];
  school: HTMLImageElement | null;
  operator: HTMLImageElement[];
  zombie: HTMLImageElement[];
  hand: HTMLImageElement[];
  taxi: HTMLImageElement[];
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
    load(`${import.meta.env.BASE_URL}game/menu.jpg`),
    load(`${import.meta.env.BASE_URL}game/corridor.jpg`),
    load(`${import.meta.env.BASE_URL}game/doors.jpg`),
    load(`${import.meta.env.BASE_URL}game/panel-keys.png`),
    load(`${import.meta.env.BASE_URL}game/ceiling.jpg`),
    load(`${import.meta.env.BASE_URL}game/ending.jpg`),
    load(`${import.meta.env.BASE_URL}game/end-home.jpg`),
    load(`${import.meta.env.BASE_URL}game/end-child.jpg`),
    load(`${import.meta.env.BASE_URL}game/end-meadow.jpg`),
    load(`${import.meta.env.BASE_URL}game/end-island.jpg`),
    load(`${import.meta.env.BASE_URL}game/end-dacha.jpg`),
    load(`${import.meta.env.BASE_URL}game/school.jpg`),
    load(`${import.meta.env.BASE_URL}game/op-1.png`),
    load(`${import.meta.env.BASE_URL}game/op-2.png`),
    load(`${import.meta.env.BASE_URL}game/op-3.png`),
    load(`${import.meta.env.BASE_URL}game/op-4.png`),
    load(`${import.meta.env.BASE_URL}game/zb-1.png`),
    load(`${import.meta.env.BASE_URL}game/zb-2.png`),
    load(`${import.meta.env.BASE_URL}game/zb-3.png`),
    load(`${import.meta.env.BASE_URL}game/zb-4.png`),
    load(`${import.meta.env.BASE_URL}game/hand-1.png`),
    load(`${import.meta.env.BASE_URL}game/hand-2.png`),
    load(`${import.meta.env.BASE_URL}game/hand-3.png`),
    load(`${import.meta.env.BASE_URL}game/hand-4.png`),
    load(`${import.meta.env.BASE_URL}game/taxi-1.png`),
    load(`${import.meta.env.BASE_URL}game/taxi-2.png`),
    load(`${import.meta.env.BASE_URL}game/taxi-4.png`),
    load(`${import.meta.env.BASE_URL}game/taxi-3.png`),
    load(`${import.meta.env.BASE_URL}game/palms.png`),
  ]).then(([menu, corridor, doors, panel, ceiling, ending, home, child, meadow, island, dacha, school, o1, o2, o3, o4, z1, z2, z3, z4, h1, h2, h3, h4, t1, t2, t4, t3, palms]) => ({
    menu,
    corridor,
    doors,
    panel,
    ceiling,
    ending,
    endings: [ending, home, child, meadow, island, dacha].filter((x): x is HTMLImageElement => x !== null),
    school,
    operator: [o1, o2, o3, o4].filter((x): x is HTMLImageElement => x !== null),
    zombie: [z1, z2, z3, z4].filter((x): x is HTMLImageElement => x !== null),
    hand: [h1, h2, h3, h4].filter((x): x is HTMLImageElement => x !== null),
    taxi: [t1, t2, t4, t3].filter((x): x is HTMLImageElement => x !== null),
    palms,
  }));
}
