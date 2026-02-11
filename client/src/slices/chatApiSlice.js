import { CHAT_URL } from '../constants';
import { apiSlice } from './apiSlice';

export const chatApiSlice = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        startSession: builder.mutation({
            query: ({ clientId, productId, sessionToken, visitorId, roomId }) => ({
                url: `${CHAT_URL}/session`,
                method: 'POST',
                body: { clientId, productId, sessionToken, visitorId, roomId }
            }),
            invalidatesTags: ['Chat']
        }),
        sendMessage: builder.mutation({
            query: ({ clientId, roomId, content }) => ({
                url: `${CHAT_URL}/message`,
                method: 'POST',
                body: { clientId, roomId, content }
            }),
            invalidatesTags: ['Chat']
        }),
        getChatHistory: builder.query({
            query: ({ roomId, clientId, limit }) => ({
                url: `${CHAT_URL}/history/${roomId}`,
                params: { clientId, limit }
            }),
            providesTags: ['Chat']
        }),
        getConversationSummaries: builder.query({
            query: ({clientId, visitorId}) => ({
                url: `${CHAT_URL}/conversations/${clientId}`,
                params: { visitorId }
            }),
            providesTags: ['Chat']
        }),
        closeSession: builder.mutation({
            query: ({ clientId, roomId }) => ({
                url: `${CHAT_URL}/close`,
                method: 'POST',
                body: { clientId, roomId }
            }),
            invalidatesTags: ['Chat']
        }),
    })
});

export const {
    useStartSessionMutation,
    useSendMessageMutation,
    useGetChatHistoryQuery,
    useGetConversationSummariesQuery,
    useCloseSessionMutation
} = chatApiSlice;