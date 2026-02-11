import { motion } from "framer-motion";
import { Home, MessageSquare, HelpCircle } from "lucide-react";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "help", label: "Help", icon: HelpCircle },
];

const ChatNavigation = ({ currentView, onNavigate }) => {
  return (
    <div className="border-t border-border bg-card px-4 py-2">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  />
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ChatNavigation;
