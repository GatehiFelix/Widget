import { motion } from "framer-motion";
import { Send, MessageSquare, FileText, Headphones, ChevronRight, ExternalLink, Star } from "lucide-react";

const ChatHome = ({ onNavigate }) => {
  const recentMessage = {
    title: "Rate your conversation",
    agent: "ZuriDesk Support",
    time: "2h ago",
  };

  const actions = [
    {
      icon: Send,
      title: "Send us a message",
      subtitle: "We typically reply in under 20 minutes",
      onClick: () => onNavigate("messages"),
      isInternal: true,
      showIcon: true,
    },
    {
      icon: Headphones,
      title: "Request a callback",
      subtitle: "Talk to an agent directly",
      onClick: () => {},
      isInternal: false,
      showIcon: true,
    },
    {
      icon: FileText,
      title: "View our FAQ's",
      subtitle: "Find quick answers",
      onClick: () => onNavigate("help"),
      isInternal: false,
      showIcon: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="h-full bg-transparent overflow-y-auto flex flex-col"
    >
      <div className="px-3 pt-6 pb-5 space-y-3 flex-1">
        {/* Rate Your Conversation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card rounded-xl p-4 border border-border cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group -mt-6 relative z-20"
          onClick={() => onNavigate("messages")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-card-foreground">{recentMessage.title}</p>
                <p className="text-sm text-muted-foreground">
                  {recentMessage.agent} • {recentMessage.time}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </motion.div>


        {/* Action Cards */}
        {actions.map((action, index) => (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            onClick={action.onClick}
            className="bg-card rounded-xl p-4 border border-border cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <action.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-card-foreground mb-1">{action.title}</p>
                  <p className="text-sm text-muted-foreground">{action.subtitle}</p>
                </div>
              </div>
              {action.isInternal ? (
                <div className="ml-3 text-primary flex-shrink-0">
                  <ChevronRight className="w-5 h-5" />
                </div>
              ) : (
                <ExternalLink className="ml-3 w-5 h-5 text-primary flex-shrink-0" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="p-5 pt-0">
        <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-2 cursor-pointer hover:bg-muted transition-colors">
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-sm text-muted-foreground">Search for help</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatHome;
