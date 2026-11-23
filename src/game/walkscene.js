// The parts of a walk that start-up never needs, second half (see walkextras.js): the scene's dressing,
// made once when a walk starts. One lazy chunk beside the place's; only walk.js reads it (through the
// pack's life.walk).
export { createWaterDressing } from '../render/waterdress.js';
export { createContactShadows } from '../render/contactshadows.js';
export { addGatewayDressing, NO_GATES } from '../world/gateway.js';
export { createClouds } from '../render/clouds.js';
