import type { Cell, Fill, MatrixObject, Shape } from "../matrigma/types";
import { SLOT_COORDS, slotOf } from "../matrigma/geometry";
import type { AttrValue } from "./attributes";
import { countLayout } from "../matrigma/layouts";

/**
 * Build an expected cell for the missing position from predicted attribute
 * values, starting from a neighbouring template cell. This is only used for
 * visualisation ("predicted missing cell"); answer matching is done by rule
 * verification against every option.
 */
export function synthesizeCell(profile: Record<string, AttrValue | null>, template: Cell | null): Cell | null {
  if (profile.objects && typeof profile.objects === "string") {
    const objs: MatrixObject[] = profile.objects
      .split(";")
      .filter(Boolean)
      .map((k) => {
        const [shape, slot, rot, fill] = k.split("|");
        const [x, y] = SLOT_COORDS[Number(slot)];
        const size = typeof profile.size === "number" ? profile.size : template?.objects[0]?.size ?? 0.35;
        return { shape: shape as Shape, slot: Number(slot), x, y, rotation: Number(rot), fill: Number(fill) as Fill, size };
      })
      .map(({ slot: _slot, ...o }) => o);
    return { objects: objs };
  }
  if (!template || !template.objects.length) return null;
  const base = template.objects[0];
  let positions: [number, number][] | null = null;
  if (typeof profile.positions === "string" && profile.positions) {
    positions = profile.positions.split(",").map((s) => SLOT_COORDS[Number(s)]);
  }
  const count = typeof profile.count === "number" ? Math.max(0, Math.round(profile.count)) : positions?.length ?? template.objects.length;
  if (!positions || positions.length !== count) {
    const sameLayout = count === template.objects.length;
    positions = sameLayout ? template.objects.map((o) => [o.x, o.y]) : countLayout(count);
  }
  const shape = (typeof profile.shape === "string" ? profile.shape : base.shape) as Shape;
  const fill = (typeof profile.fill === "number" ? profile.fill : base.fill) as Fill;
  const size = typeof profile.size === "number" ? profile.size : base.size;
  const rotation = typeof profile.rotation === "number" ? profile.rotation : base.rotation;
  return {
    objects: positions.map(([x, y]) => ({ shape, fill, size, rotation, x, y })),
  };
}

export { slotOf };
