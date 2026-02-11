import { motion } from "framer-motion";
import { Search, ChevronRight, BookOpen, HelpCircle, Phone, Mail } from "lucide-react";

import { useState } from "react";
import widgetConfig from "../../widgetConfig";

const faqCategories = [
  {
    icon: BookOpen,
    title: "Getting Started",
    description: `Learn the basics of using ${widgetConfig.brandName}`,
    articles: 12,
  },
  {
    icon: HelpCircle,
    title: "Account & Billing",
    description: `Manage your subscription and payments for ${widgetConfig.brandName}`,
    articles: 8,
  },
  {
    icon: Phone,
    title: "Call Center Features",
    description: `Set up and configure your call center for ${widgetConfig.brandName}`,
    articles: 15,
  },
  {
    icon: Mail,
    title: "CRM Integration",
    description: `Connect your CRM tools and workflows for ${widgetConfig.brandName}`,
    articles: 10,
  },
];

const popularArticles = [
  "How to set up your first call queue",
  `Integrating ${widgetConfig.brandName} with Salesforce`,
  "Managing agent schedules",
  "Understanding call analytics",
];

const ChatHelp = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="h-full bg-background rounded-t-2xl overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for help..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>

        {/* Categories */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Browse by category</h3>
          <div className="space-y-2">
            {faqCategories.map((category, index) => (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="bg-card rounded-xl p-3 zuri-shadow cursor-pointer hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center group-hover:bg-accent transition-colors">
                      <category.icon className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground text-sm">{category.title}</p>
                      <p className="text-xs text-muted-foreground">{category.articles} articles</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Popular Articles */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Popular articles</h3>
          <div className="space-y-2">
            {popularArticles.map((article, index) => (
              <motion.div
                key={article}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="py-2 px-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
              >
                <p className="text-sm text-foreground">{article}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatHelp;
