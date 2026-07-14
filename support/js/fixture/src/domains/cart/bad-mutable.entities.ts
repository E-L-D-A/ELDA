// elda/no-mutable-surface (CHANNEL.4): a live mutable binding on a module edge.
export let counter = 0;

export const bump = () => (counter += 1);
