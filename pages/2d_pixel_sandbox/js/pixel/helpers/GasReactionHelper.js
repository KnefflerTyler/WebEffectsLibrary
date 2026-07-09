export class GasReactionHelper {
  static tryCombineWith(world, i, x, y, targetMaterial, resultMaterial) {
    if (world.isStatic(i)) return false;

    let combined = false;
    world.forNeighbors(x, y, (n) => {
      if (world.isStatic(n) || world.cells[n] !== targetMaterial) return true;

      world.setCell(n, resultMaterial);
      world.setCell(i, resultMaterial);
      world.touched[n] = world.tick;
      world.touched[i] = world.tick;
      combined = true;
      return false;
    });

    return combined;
  }
}
