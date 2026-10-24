/*
 * Runs the chess AI off the panel's main thread so the board stays responsive while it thinks.
 * Receives { id, pos, opts } and answers { id, move }.
 */
importScripts('chess.js');
self.onmessage = function (e) {
  self.postMessage({ id: e.data.id, move: Chess.search(e.data.pos, e.data.opts) });
};
