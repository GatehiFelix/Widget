import React from "react";
import { FadeLoader } from "react-spinners";
import { LucideSendHorizonal } from "lucide-react";
import { useGetConversationSummariesQuery } from "@slices/chatApiSlice";

import { useDispatch, useSelector } from "react-redux";
import { setSessionToken, setVisitorId, resetAuth } from "@slices/authSlice";

const formatRelativeTime = (dateString) => {
  if (!dateString) return "";
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
};

const ChatHistory = ({ onSelectConversation }) => {
  const dispatch = useDispatch();

  const { visitorId } = useSelector((state) => state.auth);
  // const sessionToken = useSelector((state) => state.auth.sessionToken);

    const handleNewChat = async () => {
    dispatch(resetAuth());

    await new Promise((resolve) => setTimeout(resolve, 50)); 

    // Trigger new chat
    onSelectConversation(null); 
    }; 

  const clientId = 1; // Replace with actual clientId logic
  const {
    data: chatHistory,
    isLoading,
    error,
  } = useGetConversationSummariesQuery({ clientId, visitorId });
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <FadeLoader color="#2563eb" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-red-500 text-center">
          <p className="text-lg font-semibold">Error loading chat history</p>
          <p className="text-sm mt-2">
            {error.message || "Please try again later"}
          </p>
        </div>
      </div>
    );
  }

  const conversations = chatHistory?.data || [];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ...header... */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg">No conversations yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="text-lg font-bold flex justify-center ">
              Messages
            </div>

            {conversations.map((conv) => (
  <div
    key={conv.roomId}
    className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
    onClick={() => onSelectConversation(conv.roomId)}
  >
    {/* Avatar */}
    <div className="flex-shrink-0">
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#003366]">
        <span className="text-white font-bold text-lg">Z</span>
      </div>
    </div>
    {/* Info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-base font-medium text-gray-900 truncate">
          Chat with Ai Agent
        </h3>
        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
          {formatRelativeTime(conv.lastMessageAt)}
        </span>
      </div>
      <p className="text-sm text-gray-600 truncate">
        {conv.lastMessage ? (
          conv.lastMessage.length > 60 ? (
            conv.lastMessage.slice(0, 60) + "..."
          ) : (
            conv.lastMessage
          )
        ) : (
          <span className="text-gray-400 italic">
            No messages yet
          </span>
        )}
      </p>
    </div>
  </div>
))}
            
          </div>
        )}
      </div>
      {/* Button always at the bottom */}
      <div className="flex justify-center py-4">
        <button
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-[#0071b2] hover:bg-[#005c99] text-white font-semibold shadow transition-colors"
          onClick={handleNewChat}
          style={{ minWidth: 220 }}
        >
          Send us a message
          <LucideSendHorizonal className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatHistory;
