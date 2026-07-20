import { defineConfig } from "vite";
import { componentTagger } from "lovable-tagger";

export default defineConfig(() => {
  // Test reference to Lovable AI Gateway
  const gatewayUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const apiKey = process.env.LOVABLE_API_KEY || "";

  return {
    plugins: [componentTagger()],
  };
});
