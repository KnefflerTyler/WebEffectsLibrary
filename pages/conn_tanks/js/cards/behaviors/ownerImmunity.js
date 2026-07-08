export default {
  id: 'ownerImmunity',

  apply(modifiers) {
    modifiers.projectile.ownerImmune = true;
  }
};
