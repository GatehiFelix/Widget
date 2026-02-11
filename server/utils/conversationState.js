const conversationStates = new Map();

export function getState(userId) {
  return conversationStates.get(userId) || {};
}

export function setState(userId, state) {
  conversationStates.set(userId, state);
}

export function clearState(userId) {
  conversationStates.delete(userId);
}
