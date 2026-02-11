import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Bot, X, ArrowLeft } from "lucide-react";
import { SyncLoader } from "react-spinners";
import {
  useStartSessionMutation,
  useSendMessageMutation,
} from "@slices/chatApiSlice";

import { useDispatch, useSelector } from "react-redux";
import { setSessionToken, setVisitorId } from "@slices/authSlice";

const PRODUCT_ID = 2000;

const quickReplies = [
  "I need help with my account",
  "Track my ticket",
  "Billing inquiry",
  "Speak to an agent",
  "Technical support",
];

const ChatMessages = ({ roomId, onBack }) => {
  const dispatch = useDispatch();

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [session, setSession] = useState(null);
  const [hasUserSent, setHasUserSent] = useState(false);
  const messagesEndRef = useRef(null);

  const [startSession] = useStartSessionMutation();
  const [sendMessage] = useSendMessageMutation();

  const { visitorId } = useSelector((state) => state.auth);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize session on mount
  useEffect(() => {
    // Always clear state when starting a new chat
    if (roomId === null) {
      setSession(null);
      setMessages([]);
      setInputValue("");
      setIsLoading(true);
      setHasUserSent(false);
    }

    const initSession = async () => {
      try {


        let sessionTokenToSend;

        if (roomId !== null) {
          sessionTokenToSend = localStorage.getItem("chat_session");
        } else {
          // Don't send sessionToken - backend will generate a new one
          sessionTokenToSend = undefined;
        }

        const result = await startSession({
          productId: PRODUCT_ID,
          sessionToken: sessionTokenToSend, // undefined for new chats, existing for resume
          visitorId: visitorId, // Always send the same visitorId 
          roomId: roomId || undefined,
        }).unwrap();

        if (result.success) {
          const sessionData = result.data;
          setSession(sessionData);

          // Save the sessionToken from backend (new or existing)
          localStorage.setItem("chat_session", sessionData.sessionToken);
          dispatch(setSessionToken(sessionData.sessionToken));

          // visitorId should stay the same, but update just in case
          if (sessionData.visitorId && sessionData.visitorId !== visitorId) {
            localStorage.setItem("chat_visitor_id", sessionData.visitorId);
            dispatch(setVisitorId(sessionData.visitorId));
          }

          setIsLoading(false);

          if (sessionData.messages && sessionData.messages.length > 0) {
            // Resuming conversation with existing messages
            setMessages(
              sessionData.messages.map((m) => ({
                id: m.id,
                content: m.content,
                sender:
                  m.sender_type === "customer"
                    ? "user"
                    : m.sender_type === "ai"
                      ? "agent"
                      : "system",
                timestamp: new Date(m.created_at),
                agentName: m.sender_type === "ai" ? "ZuriDesk AI" : undefined,
              })),
            );
          } else {
            // New conversation - show welcome message
            setMessages([
              {
                id: "welcome",
                content:
                  "Hi there! 😊 Welcome to ZuriDesk Live Support!\n\nHow can we help you today?\nTo speak to an agent directly, click on 'speak to an agent'.",
                sender: "agent",
                timestamp: new Date(),
                agentName: "ZuriDesk AI",
              },
            ]);
          }
        }
      } catch (error) {
        console.error("Session init error:", error);
        setIsLoading(false);
        setMessages([
          {
            id: "error",
            content:
              "Sorry, we couldn't connect to the chat service. Please refresh and try again.",
            sender: "agent",
            timestamp: new Date(),
            agentName: "System",
          },
        ]);
      }
    };

    initSession();
  }, [startSession, roomId, dispatch, visitorId]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !session || isSending) return;

    const userMessage = {
      id: Date.now().toString(),
      content: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsSending(true);
    setHasUserSent(true);

    try {
      const result = await sendMessage({
        clientId: session.clientId,
        roomId: session.roomId,
        content: userMessage.content,
      }).unwrap();

      if (result.success && result.data.message) {
        const aiMessage = {
          id: result.data.message.id?.toString() || Date.now().toString(),
          content: result.data.message.content,
          sender: "agent",
          timestamp: new Date(result.data.message.created_at || Date.now()),
          agentName: "ZuriDesk AI",
        };
        setMessages((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content:
          "Thanks for reaching out! One of our agents will be with you shortly.",
        sender: "agent",
        timestamp: new Date(),
        agentName: "ZuriDesk AI",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickReply = (reply) => {
    setInputValue(reply);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="h-full bg-background flex flex-col "
    >
      {/* Chat Header */}
      <div className="px-2 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-9 h-9 rounded-lg zuri-gradient flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">ZuriDesk AI Agent</p>
            <p className="text-xs text-muted-foreground">
              The team can also help
            </p>
          </div>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-center text-xs text-muted-foreground">
          Ask us anything, or share your feedback.
        </p>

        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <SyncLoader color="#a2a6ac" size={10} speedMultiplier={0.5} />
          </div>
        )}

        {!isLoading &&
          messages.map((message, index, arr) => {
            const isLastAgentMessage =
              message.sender === "agent" &&
              arr.slice(index + 1).every((m) => m.sender === "user");

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.sender === "user"
                      ? "bg-[#1a4b7c] text-white rounded-br-md"
                      : message.sender === "system"
                        ? "bg-blue-50 text-blue-800 rounded-bl-md border border-blue-200"
                        : "bg-gray-100 text-gray-800 rounded-bl-md"
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">
                    {message.content}
                  </p>
                  {message.agentName && isLastAgentMessage && (
                    <p className="text-xs mt-2 opacity-70">
                      {message.agentName} • Just now
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-zuri-bubble-agent rounded-2xl rounded-bl-md px-4 py-3">
              <SyncLoader color="#9ca3af" size={6} speedMultiplier={0.7} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />

        {!isLoading && messages.length > 0 && !hasUserSent && (
          <div className="flex flex-wrap gap-2 justify-end pt-2">
            {quickReplies.map((reply) => (
              <motion.button
                key={reply}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleQuickReply(reply)}
                className="px-3 py-2 text-sm border border-primary text-primary rounded-full hover:bg-secondary transition-colors"
              >
                {reply}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-end border-2 border-primary/30 rounded-3xl px-4 py-2 focus-within:border-primary transition-colors bg-white">
          {/* Textarea */}
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            disabled={isLoading || isSending}
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 resize-none max-h-32 overflow-y-auto py-2"
            style={{
              minHeight: "24px",
              lineHeight: "1.5",
            }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height =
                Math.min(e.target.scrollHeight, 128) + "px";
            }}
          />
          {/* Send Button */}
          <motion.button
            whileHover={inputValue.trim() ? { scale: 1.05 } : {}}
            whileTap={inputValue.trim() ? { scale: 0.95 } : {}}
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || isSending}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ml-2 mb-2 ${
              inputValue.trim()
                ? "bg-[#1a4b7c] text-white cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessages;
