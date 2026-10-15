/**
 * Where the camera is looking, written every frame by the 3D camera rig and
 * read every frame by the minimap. A plain mutable object on purpose: it
 * changes 60 times a second and must not re-render React.
 */
export const cameraView = {
  target: { x: 0, z: 0 },
  /** Floor-plane corners of the visible area (may be empty before the first frame). */
  footprint: [] as Array<{ x: number; z: number }>,
};
