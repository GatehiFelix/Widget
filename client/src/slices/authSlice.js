import { createSlice } from '@reduxjs/toolkit';

// Generate persistent visitorId (only once, ever)
const getOrCreateVisitorId = () => {
  let visitorId = localStorage.getItem('chat_visitor_id');
  if (!visitorId) {
    visitorId = `vis_${crypto.randomUUID()}`;
    localStorage.setItem('chat_visitor_id', visitorId);
  }
  return visitorId;
};

const initialState = {
  sessionToken: localStorage.getItem('chat_session') || null,
  visitorId: getOrCreateVisitorId(), // Always use existing or create new
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSessionToken(state, action) {
      state.sessionToken = action.payload;
      if (action.payload === null || action.payload === undefined) {
        localStorage.removeItem('chat_session');
      } else {
        localStorage.setItem('chat_session', action.payload);
      }
    },
    setVisitorId(state, action) {
      state.visitorId = action.payload;
      if (action.payload === null || action.payload === undefined) {
        localStorage.removeItem('chat_visitor_id');
      } else {
        localStorage.setItem('chat_visitor_id', action.payload);
      }
    },
    resetAuth(state) {
      // Only clear sessionToken, keep visitorId
      state.sessionToken = null;
      localStorage.removeItem('chat_session');
      // visitorId stays the same!
    },
  },
});

export const { setSessionToken, setVisitorId, resetAuth } = authSlice.actions;
export default authSlice.reducer;