import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Minimize2 } from "lucide-react";
import ChatHome from "@/components/chats/ChatHome";
import ChatMessages from "@/components/chats/ChatMessages";
import ChatHelp from "@/components/chats/ChatHelp";
import ChatNavigation from "@/components/chats/ChatNavigation";
import ChatHistory from "@components/chats/ChatHistory";

import { useStartSessionMutation } from "@slices/chatApiSlice";

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentView, setCurrentView] = useState("home");
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [startSession] = useStartSessionMutation();
  
  // Track if chat is active (messages or history view)
  const isChatActive = currentView === "messages" || currentView === "history";

  const handleNavigate = (view) => {
    // When navigating to messages from home, show history first
    if (view === "messages") {
      setCurrentView("history");
    } else {
      setCurrentView(view);
      setSelectedRoomId(null); // Reset selected room when navigating away
    }
  };

  const handleSelectConversation = (roomId) => {
    setSelectedRoomId(roomId);
    setCurrentView("messages");
  };

  const handleBackToHistory = () => {
    setCurrentView("history");
    setSelectedRoomId(null);
  };

    const handleSelectedConversation = async (roomId) => {
    // Get tokens from storage or state as needed
    const sessionToken = localStorage.getItem('chat_session');
    const visitorId = localStorage.getItem('chat_visitor_id');
    const clientId = 1; // Replace with actual logic

    try {
      const result = await startSession({
        clientId,
        sessionToken,
        visitorId,
        roomId, // Pass the roomId to resume
      }).unwrap();

      // Navigate to messages view, passing session info
      setSelectedRoomId(result.data.roomId);
      setCurrentView('messages');
      // Optionally, store session context/messages as needed
    } catch (err) {
      // Handle error (show toast, etc)
    }
  };

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <ChatHome onNavigate={handleNavigate} />;
      case "history":
        return <ChatHistory onSelectConversation={handleSelectedConversation} />;
      case "messages":
        return <ChatMessages roomId={selectedRoomId} onBack={handleBackToHistory} />;
      case "help":
        return <ChatHelp />;
      default:
        return <ChatHome onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-20 right-0 w-[440px] h-[820px] bg-background rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
          >
            {/* Header - slides up when chat is active */}
            <motion.div
              initial={false}
              animate={{
                y: isChatActive ? -120 : 0,
                opacity: isChatActive ? 0 : 1,
                height: isChatActive ? 0 : 300,
                marginBottom: isChatActive ? 0 : 0,
                marginTop: isChatActive ? -20 : 0,
              }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{ overflow: 'visible'}}
              className="bg-[linear-gradient(to_bottom,#0071b2_0%,#4596c5_65%,#fff_100%)] text-primary-foreground pt-4 pb-6 px-6 flex flex-col relative z-0"
            >
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary-foreground/20 flex items-center justify-center">
                      <span className="font-bold text-sm">Z</span>
                    </div>
                    <span className="font-bold text-lg">ZuriDesk</span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-primary-foreground/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Agent and team info */}
                <div className="mb-2">
                  <span className="font-semibold block">ZuriDesk AI Agent</span>
                  <span className="text-xs text-primary-foreground/80 block mt-0.5">The team can also help</span>
                </div>
                
                {/* Divider */}
                <div className="border-b border-primary-foreground/20 mb-4" />
                
                <div>
                  <h2 className="text-3xl font-bold mb-1">Hi there 👋</h2>
                  <p className="text-2xl font-semibold">How can we help?</p>
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative z-10">
              <AnimatePresence mode="wait">{renderView()}</AnimatePresence>
            </div>

            {/* Navigation - hide when in history view */}
              <ChatNavigation
                currentView={currentView === "history" ? "messages" : currentView} 
                onNavigate={handleNavigate}
              />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized state */}
      <AnimatePresence>
        {isOpen && isMinimized && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsMinimized(false)}
            className="absolute bottom-20 right-0 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-medium">ZuriDesk</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setIsOpen(!isOpen);
          setIsMinimized(false);
        }}
        className="w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center relative"
      >
        <AnimatePresence mode="wait">
          {isOpen && !isMinimized ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageCircle className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notification badge */}
        {!isOpen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center font-bold"
          >
            1
          </motion.span>
        )}
      </motion.button>
    </div>
  );
};

export default ChatWidget;