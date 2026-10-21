// The little drawings of the garden's visitors and pets, in the map's
// line-art style. Each is drawn in its own small units around (0, 0), facing
// right, and placed and scaled (and flipped to face left) by `place`.

import type { DogCoat } from "@/lib/map/pets";
import { BIRDS, BUTTERFLIES, CATS, SQUIRRELS } from "@/lib/map/wildlife";

export const place = (x: number, y: number, k: number, facing = 1) => `translate(${x} ${y}) scale(${k * facing} ${k})`;

export function Songbird({ x, y, k, facing, look, flying }: { x: number; y: number; k: number; facing: number; look: number; flying: boolean }) {
  const c = BIRDS[look % BIRDS.length];
  if (flying)
    return (
      <g transform={place(x, y, k, facing)}>
        <title>{c.name}</title>
        <g className="flap">
          <path d="M-1.7 -0.1 Q -0.9 -1 0 -0.1 Q 0.9 -1 1.7 -0.1" stroke={c.wing} strokeWidth={0.38} fill="none" strokeLinecap="round" />
        </g>
        <ellipse cx={0} cy={0} rx={0.55} ry={0.32} fill={c.body} />
      </g>
    );
  return (
    <g transform={place(x, y, k, facing)}>
      <title>{c.name}</title>
      <path d="M-0.8 -0.1 L-1.7 -0.55 L-1.55 0.1 Z" fill={c.wing} />
      <ellipse cx={0} cy={0} rx={1} ry={0.62} fill={c.body} />
      <ellipse cx={0.2} cy={0.17} rx={0.6} ry={0.4} fill={c.breast} />
      <path d="M-0.65 -0.25 Q -0.1 -0.55 0.45 -0.12 L -0.3 0.25 Z" fill={c.wing} />
      <circle cx={0.85} cy={-0.45} r={0.42} fill={c.body} />
      <path d="M1.22 -0.52 L1.6 -0.42 L1.22 -0.32 Z" fill="#d9a03a" />
      <circle cx={0.98} cy={-0.53} r={0.08} fill="#141414" />
      <path d="M-0.1 0.6 L-0.15 0.95 M0.25 0.6 L0.25 0.95" stroke="#5a4636" strokeWidth={0.1} />
    </g>
  );
}

export function Hummingbird({ x, y, k, facing }: { x: number; y: number; k: number; facing: number }) {
  return (
    <g transform={place(x, y, k, facing)}>
      <title>Hummingbird</title>
      <g className="buzz">
        <ellipse cx={-0.1} cy={-0.7} rx={0.35} ry={0.9} fill="#d8eef0" opacity={0.7} transform="rotate(-25)" />
      </g>
      <ellipse cx={0} cy={0} rx={0.8} ry={0.38} fill="#3f8f5a" transform="rotate(-20)" />
      <path d="M-0.7 0.15 L-1.3 0.55 L-1.1 0.05 Z" fill="#2f6e45" />
      <circle cx={0.65} cy={-0.32} r={0.3} fill="#3f8f5a" />
      <circle cx={0.62} cy={-0.1} r={0.18} fill="#c0392b" />
      <path d="M0.92 -0.36 L1.85 -0.2" stroke="#2b2b2b" strokeWidth={0.08} />
      <circle cx={0.72} cy={-0.38} r={0.06} fill="#111" />
    </g>
  );
}

export function Butterfly({ x, y, k, look }: { x: number; y: number; k: number; look: number }) {
  const c = BUTTERFLIES[look % BUTTERFLIES.length];
  return (
    <g transform={place(x, y, k)}>
      <title>{c.name}</title>
      <g className="flutter">
        <ellipse cx={-0.55} cy={-0.35} rx={0.6} ry={0.48} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={0.55} cy={-0.35} rx={0.6} ry={0.48} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={-0.4} cy={0.3} rx={0.38} ry={0.3} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={0.4} cy={0.3} rx={0.38} ry={0.3} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
      </g>
      <line x1={0} y1={-0.55} x2={0} y2={0.55} stroke="#2b2b2b" strokeWidth={0.14} strokeLinecap="round" />
    </g>
  );
}

export function Cat({ x, y, k, facing, coat, walking, running }: { x: number; y: number; k: number; facing: number; coat: number; walking: boolean; running?: boolean }) {
  const c = CATS[coat % CATS.length];
  const belly = c.belly ?? c.base;
  const ears = (dx: number) => `M${0.02 + dx} -0.9 L${0.12 + dx} -1.45 L${0.45 + dx} -1.05 Z M${0.55 + dx} -1.05 L${0.95 + dx} -1.45 L${0.98 + dx} -0.88 Z`;
  return (
    <g transform={place(x, y, k, facing)} className={`cat${running ? " run" : ""}`} pointerEvents="all">
      <title>{running ? `${c.name} is running off` : `${c.name} is visiting`}</title>
      <ellipse cx={0} cy={1.25} rx={1.4} ry={0.35} fill="#000" opacity={0.12} />
      {walking ? (
        <g className="cat-walk">
          <path d="M-1.05 0.1 C -1.6 -0.2 -1.7 -0.8 -1.35 -1.1" stroke={c.base} strokeWidth={0.28} fill="none" strokeLinecap="round" />
          <g className="leg-a">
            <path d="M-0.7 0.5 L-0.8 1.2 M0.55 0.5 L0.65 1.2" stroke={c.base} strokeWidth={0.26} strokeLinecap="round" />
          </g>
          <g className="leg-b">
            <path d="M-0.45 0.5 L-0.35 1.2 M0.8 0.5 L0.7 1.2" stroke={c.stripes ?? c.base} strokeWidth={0.26} strokeLinecap="round" />
          </g>
          <ellipse cx={0} cy={0.25} rx={1.15} ry={0.5} fill={c.base} />
          {c.stripes && <path d="M-0.6 -0.15 q0.1 0.3 0 0.6 M-0.2 -0.22 q0.1 0.35 0 0.7 M0.2 -0.2 q0.1 0.3 0 0.6" stroke={c.stripes} strokeWidth={0.12} fill="none" />}
          {c.patch && <ellipse cx={-0.4} cy={0.05} rx={0.45} ry={0.3} fill={c.patch} />}
          <ellipse cx={0.3} cy={0.45} rx={0.55} ry={0.22} fill={belly} />
          <g transform="translate(0.75 0.05)">
            <circle cx={0.45} cy={-0.55} r={0.5} fill={c.base} />
            <path d={ears(0)} fill={c.base} transform="translate(0.05 0.15) scale(0.85)" />
            <circle cx={0.62} cy={-0.62} r={0.07} fill="#2a2a2a" />
            <path d="M0.9 -0.48 l0.08 0.06 l-0.1 0.04 Z" fill="#e58a9a" />
          </g>
        </g>
      ) : (
        <g>
          <path className="tail" d="M-0.85 1 C -1.75 0.95 -1.8 0 -1.3 -0.35" stroke={c.base} strokeWidth={0.3} fill="none" strokeLinecap="round" />
          <ellipse cx={-0.15} cy={0.4} rx={0.9} ry={0.8} fill={c.base} />
          {c.stripes && <path d="M-0.75 0.1 q0.25 0.15 0.15 0.5 M-0.55 -0.15 q0.3 0.2 0.2 0.6 M-0.85 0.55 q0.25 0.1 0.2 0.4" stroke={c.stripes} strokeWidth={0.12} fill="none" />}
          {c.patch && <ellipse cx={-0.45} cy={0.25} rx={0.42} ry={0.38} fill={c.patch} />}
          <ellipse cx={0.25} cy={0.65} rx={0.42} ry={0.48} fill={belly} />
          <circle cx={0.45} cy={-0.5} r={0.6} fill={c.base} />
          {c.patch && <path d="M0.0 -0.85 Q 0.35 -0.95 0.42 -0.5 Q 0.1 -0.35 -0.08 -0.55 Z" fill={c.patch} />}
          <path d={ears(0)} fill={c.base} />
          <path d="M0.15 -1.05 L0.2 -1.3 L0.36 -1.1 Z M0.68 -1.1 L0.88 -1.3 L0.87 -1.02 Z" fill="#e8a3ad" />
          <g className="blink">
            <ellipse cx={0.28} cy={-0.55} rx={0.08} ry={0.12} fill="#2a2a2a" />
            <ellipse cx={0.66} cy={-0.55} rx={0.08} ry={0.12} fill="#2a2a2a" />
          </g>
          <path d="M0.42 -0.36 l0.08 0.07 l0.08 -0.07 Z" fill="#e58a9a" />
          <path d="M0.1 1.05 L0.12 1.2 M0.4 1.05 L0.42 1.2" stroke={belly} strokeWidth={0.22} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export type SquirrelPose = "forage" | "up" | "run" | "climb" | "perch";

export function Squirrel({ x, y, k, facing, look, pose }: { x: number; y: number; k: number; facing: number; look: number; pose: SquirrelPose }) {
  const c = SQUIRRELS[look % SQUIRRELS.length];
  const what = pose === "climb" ? "running up a tree" : pose === "perch" ? "up a tree" : pose === "run" ? "running" : "foraging";
  if (pose === "up")
    return (
      <g transform={place(x, y, k, facing)}>
        <title>{`${c.name} sitting up`}</title>
        <ellipse cx={0} cy={0.62} rx={0.6} ry={0.16} fill="#000" opacity={0.12} />
        <path d="M-0.25 0.45 C -1.05 0.35 -1.1 -0.8 -0.55 -1.15 C -0.3 -1.3 -0.15 -1.05 -0.3 -0.85" stroke={c.tail} strokeWidth={0.42} fill="none" strokeLinecap="round" />
        <ellipse cx={0.05} cy={0} rx={0.33} ry={0.58} fill={c.body} />
        <ellipse cx={0.18} cy={0.05} rx={0.16} ry={0.4} fill={c.belly} />
        <circle cx={0.18} cy={-0.68} r={0.25} fill={c.body} />
        <path d="M0.02 -0.86 L0.06 -1.08 L0.2 -0.9 Z" fill={c.body} />
        <circle cx={0.3} cy={-0.72} r={0.05} fill="#141414" />
        <path d="M0.3 -0.3 L0.45 -0.42" stroke={c.body} strokeWidth={0.1} strokeLinecap="round" />
        <path d="M-0.05 0.55 L0.2 0.58" stroke={c.body} strokeWidth={0.12} strokeLinecap="round" />
      </g>
    );
  const running = pose === "run" || pose === "climb";
  const headY = pose === "forage" ? 0.2 : -0.18;
  return (
    <g transform={`${place(x, y, k, facing)}${pose === "climb" ? " rotate(-80)" : ""}`} className={running ? "squirrel run" : "squirrel"}>
      <title>{`${c.name} ${what}`}</title>
      {pose !== "climb" && pose !== "perch" && <ellipse cx={0} cy={0.5} rx={0.75} ry={0.16} fill="#000" opacity={0.12} />}
      <path
        d={running ? "M-0.5 0 C -1.05 -0.15 -1.5 -0.5 -1.95 -0.3" : "M-0.5 0.05 C -1.3 0.1 -1.5 -0.7 -1.1 -1.15 C -0.85 -1.45 -0.45 -1.3 -0.55 -0.95"}
        stroke={c.tail}
        strokeWidth={0.42}
        fill="none"
        strokeLinecap="round"
      />
      <g className={running ? "leg-a" : ""}>
        <path d="M-0.35 0.3 L-0.45 0.5 M0.35 0.3 L0.45 0.5" stroke={c.body} strokeWidth={0.12} strokeLinecap="round" />
      </g>
      <ellipse cx={0} cy={0.1} rx={0.6} ry={0.34} fill={c.body} />
      <ellipse cx={0.15} cy={0.27} rx={0.35} ry={0.13} fill={c.belly} />
      <circle cx={0.62} cy={headY} r={0.25} fill={c.body} />
      <path d={`M${0.5} ${headY - 0.18} L${0.55} ${headY - 0.42} L${0.68} ${headY - 0.2} Z`} fill={c.body} />
      <circle cx={0.74} cy={headY - 0.04} r={0.05} fill="#141414" />
    </g>
  );
}

export type DogPose = "stand" | "walk" | "run" | "sniff" | "bark" | "lie";

/** Flecks over a heeler's coat, in body units. */
const SPECKLE = [[-0.9, -0.1], [-0.55, 0.15], [-0.2, -0.25], [0.15, 0.05], [0.5, -0.2], [-0.7, -0.35], [0.3, 0.3], [-0.35, 0.35], [0.75, 0.1]];

export function Dog({ x, y, k, facing, coat, pose, name }: { x: number; y: number; k: number; facing: number; coat: DogCoat; pose: DogPose; name: string }) {
  const c = coat;
  const title = { stand: `${name} is out`, walk: `${name} is out`, run: `${name} is giving chase`, sniff: `${name} is sniffing around`, bark: `${name} is barking`, lie: `${name} is lying in the sun` }[pose];
  const eye = <circle cx={0.62} cy={-0.62} r={0.07} fill="#1d1d1d" />;
  const ears = <path d="M0.05 -0.8 L0.08 -1.42 L0.4 -0.95 Z M0.36 -0.92 L0.52 -1.48 L0.72 -0.96 Z" fill={c.dark} />;
  const blaze = c.blaze && <path d="M0.4 -0.98 L0.47 -0.66 L0.55 -0.98 Z" fill="#f6efe6" />;
  const speckle = c.speckle && SPECKLE.map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r={0.07} fill={c.speckle} />);
  if (pose === "lie")
    return (
      <g transform={place(x, y, k, facing)} className="dog" pointerEvents="all">
        <title>{title}</title>
        <ellipse cx={0.2} cy={1.45} rx={2.2} ry={0.35} fill="#000" opacity={0.12} />
        <path className="tail" d="M-1.45 1.15 C -1.95 1.25 -2.3 1.15 -2.5 0.95" stroke={c.base} strokeWidth={0.3} fill="none" strokeLinecap="round" />
        <ellipse cx={-0.15} cy={0.95} rx={1.45} ry={0.5} fill={c.base} />
        <g transform="translate(0 0.95) scale(1 0.7)">{speckle}</g>
        <path d="M0.8 1.18 L2.05 1.24 M0.75 1.36 L1.95 1.42" stroke={c.base} strokeWidth={0.26} strokeLinecap="round" />
        <path d="M1.95 1.24 L2.12 1.25 M1.85 1.42 L2.02 1.43" stroke={c.light} strokeWidth={0.26} strokeLinecap="round" />
        <g transform="translate(1.05 1.25)">
          <ellipse cx={0.4} cy={-0.5} rx={0.48} ry={0.38} fill={c.base} />
          <path d="M0.65 -0.6 L1.3 -0.45 Q1.35 -0.25 1.15 -0.22 L0.65 -0.28 Z" fill={c.light} />
          <circle cx={1.28} cy={-0.42} r={0.08} fill="#1d1d1d" />
          <g transform="translate(0 0.12)">{ears}</g>
          {blaze}
          <path d="M0.52 -0.6 Q0.62 -0.54 0.72 -0.6" stroke="#1d1d1d" strokeWidth={0.06} fill="none" />
        </g>
      </g>
    );
  const moving = pose === "walk" || pose === "run";
  const tilt = pose === "sniff" ? 38 : pose === "bark" ? -18 : 0;
  return (
    <g transform={place(x, y, k, facing)} className={`dog${pose === "run" ? " run" : ""}`} pointerEvents="all">
      <title>{title}</title>
      <ellipse cx={0} cy={1.55} rx={1.9} ry={0.38} fill="#000" opacity={0.12} />
      <path className={moving ? "" : "wag"} d="M-1.35 -0.05 C -1.9 -0.25 -2.1 -0.6 -2.05 -0.95" stroke={c.base} strokeWidth={0.32} fill="none" strokeLinecap="round" />
      <g className={moving ? "leg-b" : ""}>
        <path d="M-0.95 0.35 L-1.05 1.5 M0.75 0.35 L0.85 1.5" stroke={c.dark} strokeWidth={0.3} strokeLinecap="round" />
      </g>
      <ellipse cx={0} cy={0.1} rx={1.45} ry={0.62} fill={c.base} />
      {speckle}
      <ellipse cx={0.25} cy={0.5} rx={0.9} ry={0.2} fill={c.light} />
      <g className={moving ? "leg-a" : ""}>
        <path d="M-0.7 0.4 L-0.6 1.5 M1.0 0.4 L1.1 1.5" stroke={c.base} strokeWidth={0.32} strokeLinecap="round" />
      </g>
      <g transform={`translate(1.15 -0.3) rotate(${tilt} 0 0.2)`}>
        <path d="M-0.15 0.3 L0.25 -0.35" stroke={c.base} strokeWidth={0.62} strokeLinecap="round" />
        <ellipse cx={0.4} cy={-0.55} rx={0.5} ry={0.42} fill={c.base} />
        <ellipse cx={0.55} cy={-0.58} rx={0.22} ry={0.18} fill={c.dark} opacity={c.speckle ? 0.6 : 0} />
        <path d={pose === "bark" ? "M0.7 -0.65 L1.35 -0.5 L0.95 -0.38 L1.25 -0.15 L0.7 -0.25 Z" : "M0.7 -0.65 L1.35 -0.45 Q1.4 -0.25 1.2 -0.2 L0.7 -0.25 Z"} fill={c.light} />
        {pose === "bark" && <path d="M0.95 -0.38 L1.25 -0.15 L1.3 -0.34 Z" fill="#8a3030" />}
        <circle cx={1.33} cy={pose === "bark" ? -0.52 : -0.42} r={0.09} fill="#1d1d1d" />
        {ears}
        {blaze}
        {eye}
      </g>
      {pose === "bark" && (
        <g transform={`translate(1.9 -2.3) scale(${facing} 1)`} className="woof">
          <text textAnchor="middle" fontSize={0.75} fontWeight={700} fill="#4a3a28" stroke="#fffaf0" strokeWidth={0.18} paintOrder="stroke">
            Woof!
          </text>
        </g>
      )}
    </g>
  );
}
