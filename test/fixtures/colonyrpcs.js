// The colony RPC contract (docs/supabase-colony.sql): each RPC's argument
// names, in order. PostgREST passes arguments BY NAME, so these must match the
// SQL exactly. Shared by test/colonysql.test.js (checks the SQL) and the
// colony cloud wrappers' test (checks the client), which is why it lives in a
// fixture: importing one test file from another would register its suites twice.
export const RPCS = {
  colony_invite_open: ['p_player_id', 'p_secret'],
  colony_invite_join: ['p_player_id', 'p_secret', 'p_code'],
  colony_invite_answer: ['p_player_id', 'p_secret', 'p_accept'],
  colony_sync: ['p_player_id', 'p_secret', 'p_wardrobe'],
  colony_feed: ['p_player_id', 'p_secret', 'p_cat', 'p_walk', 'p_area', 'p_x', 'p_z', 'p_head', 'p_tamed'],
  colony_dress: ['p_player_id', 'p_secret', 'p_cat', 'p_item'],
  colony_trade_offer: ['p_player_id', 'p_secret', 'p_give', 'p_want'],
  colony_trade_answer: ['p_player_id', 'p_secret', 'p_trade_id', 'p_accept'],
  colony_trade_cancel: ['p_player_id', 'p_secret', 'p_trade_id'],
};
