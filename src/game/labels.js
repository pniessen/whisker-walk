// Display names for critter/subject types. Shared by the spot-award path
// (updateInteractions), the pounce-hunt award, and the photo album's subject
// label — one table so a critter never reads as "a songbird" in one place and
// "something interesting" in another.
export function labelFor(type) {
  return {
    bird: 'a songbird', squirrel: 'a busy squirrel', butterfly: 'a butterfly',
    duck: 'a paddling duck', seagull: 'a seagull', crab: 'a sideways crab',
    dog: 'the neighbor’s dog', villager: 'a friendly neighbor',
    firefly: 'a glowing firefly', mouse: 'a quick little mouse',
  }[type] ?? 'something interesting';
}
