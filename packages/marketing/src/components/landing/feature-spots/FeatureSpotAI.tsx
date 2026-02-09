import { motion } from "motion/react";

interface Message {
  type: "user" | "assistant";
  content: string;
}

const messages: Message[] = [
  { type: "user", content: "Summarize this page" },
  { type: "assistant", content: "Here's a summary of the key points..." },
];

export function FeatureSpotAI() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      {/* AI Assistant card */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[200px] bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden"
      >
        {/* Header with sparkle */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 bg-gradient-to-r from-blue-50/50 to-transparent">
          <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{
              delay: 0.5,
              duration: 0.6,
              repeat: Infinity,
              repeatDelay: 3,
            }}
            className="w-4 h-4 text-blue-500"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </motion.div>
          <span className="text-xs font-medium text-gray-700">AI Assistant</span>
        </div>

        {/* Messages */}
        <div className="p-2.5 space-y-2.5">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.2, duration: 0.3 }}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[0.7rem] leading-relaxed ${
                  msg.type === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"
                }`}
              >
                {msg.type === "assistant" ? (
                  <div className="space-y-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ delay: 0.6 + i * 0.2, duration: 0.8 }}
                      className="h-1.5 bg-current opacity-20 rounded-full overflow-hidden"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "75%" }}
                      transition={{ delay: 0.8 + i * 0.2, duration: 0.6 }}
                      className="h-1.5 bg-current opacity-20 rounded-full overflow-hidden"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "50%" }}
                      transition={{ delay: 1 + i * 0.2, duration: 0.4 }}
                      className="h-1.5 bg-current opacity-20 rounded-full overflow-hidden"
                    />
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="flex justify-start"
          >
            <div className="bg-gray-100 rounded-lg px-2 py-1.5">
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 bg-gray-400 rounded-full"
                    animate={{ y: [0, -2, 0] }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Input */}
        <div className="px-2.5 pb-2.5">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 rounded-md border border-gray-100">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full" />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.4, type: "spring", stiffness: 500 }}
              className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"
            >
              <svg
                className="w-2.5 h-2.5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Glow effect */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-400/10 via-transparent to-purple-400/10 blur-xl" />
    </div>
  );
}
