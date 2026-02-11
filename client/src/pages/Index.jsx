import ChatWidget from "@/components/chat/ChatWidget";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Demo page background */}
      <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted/50" />
      
      {/* Demo content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        <div className="text-center max-w-2xl">
          
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            ZuriDesk
            <span className="block text-primary">Webchat Widget</span>
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            A modern, professional webchat UI designed for call centers and CRM systems. 
            Click the chat button in the bottom-right corner to explore.
          </p>

          {/* <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full zuri-gradient" />
              <span>Teal branding</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-card border border-border" />
              <span>Clean cards</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-muted" />
              <span>Smooth animations</span>
            </div>
          </div> */}
        </div>
      </div>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
};

export default Index;
